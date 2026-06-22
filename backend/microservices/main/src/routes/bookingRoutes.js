'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { sequelize, Event, Booking, SeatBooked } = require('../db');
const redis = require('../redis');
const keys = require('../keys');
const lua = require('../lua');
const { ensureEventState } = require('../redisState');

const router = express.Router();
const SESSION_EXPIRED = 'session expired';

function publish(eventId, payload) {
  return redis.publish(keys.pubsub(eventId), JSON.stringify(payload));
}

function serializeBooking(b, extra = {}) {
  const j = b.toJSON ? b.toJSON() : b;
  return {
    id: j.id,
    userId: j.userId,
    eventId: j.eventId,
    numSeats: j.numSeats,
    status: j.status,
    amount: j.amount != null ? Number(j.amount) : null,
    paymentRef: j.paymentRef,
    createdAt: j.createdAt,
    ...extra,
  };
}

// Sync the DB display cache (events.available_seats) to live Redis avlbl.
async function syncAvlblCache(ev, avlblMaybe) {
  let avlbl = avlblMaybe;
  if (avlbl == null) {
    const v = await redis.get(keys.avlbl(ev.id));
    avlbl = v != null ? parseInt(v, 10) : null;
  }
  if (avlbl != null) await ev.update({ availableSeats: avlbl });
}

// --------------------------------------------------------------------------
// POST /events/:eventid/checkout — synchronous, fake gateway, branches on model.
// --------------------------------------------------------------------------
router.post('/events/:eventid/checkout', async (req, res) => {
  const eventId = parseInt(req.params.eventid, 10);
  const userId = req.userId;
  try {
    const ev = await Event.findByPk(eventId);
    if (!ev) return res.status(404).json({ error: 'event not found' });
    await ensureEventState(ev);

    if (ev.model === 'seat_map') {
      const seatNums = (req.body && req.body.seat_nums) || [];
      if (!Array.isArray(seatNums) || seatNums.length === 0) {
        return res.status(400).json({ error: 'seat_nums required' });
      }
      const ok = await redis.eval(
        lua.CHECKOUT_SEATMAP, 2,
        keys.status(eventId), keys.book(eventId),
        String(userId), keys.lockSeatPrefix(eventId), ...seatNums.map(String),
      );
      if (Number(ok) !== 1) return res.status(409).json({ error: SESSION_EXPIRED });

      const amount = Number(ev.price) * seatNums.length;
      const booking = await Booking.create({
        userId, eventId, numSeats: seatNums.length,
        status: 'confirmed', amount, paymentRef: `FAKE-${uuidv4()}`,
      });
      await SeatBooked.bulkCreate(seatNums.map((s) => ({ bookingId: booking.id, eventId, seatNum: s })));
      for (const s of seatNums) await publish(eventId, { seat_num: s, new_status: 2 });
      await syncAvlblCache(ev);
      return res.status(200).json(serializeBooking(booking, { seats: seatNums }));
    }

    // general
    const n = parseInt((req.body && req.body.num_seats), 10);
    if (!Number.isInteger(n) || n <= 0) return res.status(400).json({ error: 'num_seats required' });

    const r = await redis.eval(
      lua.CHECKOUT_GENERAL, 3,
      keys.lockCount(eventId, n, userId), keys.book(eventId), keys.avlbl(eventId),
      String(n),
    );
    if (!Array.isArray(r) || Number(r[0]) !== 1) return res.status(409).json({ error: SESSION_EXPIRED });

    const avlbl = parseInt(r[1], 10);
    const book = parseInt(r[2], 10);
    const amount = Number(ev.price) * n;
    const booking = await Booking.create({
      userId, eventId, numSeats: n, status: 'confirmed', amount, paymentRef: `FAKE-${uuidv4()}`,
    });
    await publish(eventId, { avlbl, book });
    await syncAvlblCache(ev, avlbl);
    return res.status(200).json(serializeBooking(booking));
  } catch (e) {
    console.error('[checkout]', e);
    return res.status(500).json({ error: 'checkout failed' });
  }
});

// --------------------------------------------------------------------------
// DELETE /events/:eventid/cancel/:bookingid — whole booking, both models.
// --------------------------------------------------------------------------
router.delete('/events/:eventid/cancel/:bookingid', async (req, res) => {
  const eventId = parseInt(req.params.eventid, 10);
  const bookingId = parseInt(req.params.bookingid, 10);
  try {
    const booking = await Booking.findByPk(bookingId);
    if (!booking) return res.status(404).json({ error: 'booking not found' });
    if (booking.userId !== req.userId) return res.status(403).json({ error: 'forbidden' });
    if (booking.eventId !== eventId) return res.status(400).json({ error: 'event/booking mismatch' });
    if (booking.status === 'cancelled') return res.status(400).json({ error: 'already cancelled' });

    const ev = await Event.findByPk(eventId);
    await ensureEventState(ev);

    if (ev.model === 'seat_map') {
      const seats = await SeatBooked.findAll({ where: { bookingId: booking.id, cancelled: false } });
      const seatNums = seats.map((s) => s.seatNum);
      if (seatNums.length) {
        await redis.eval(
          lua.CANCEL_SEATMAP, 3,
          keys.status(eventId), keys.avlbl(eventId), keys.book(eventId),
          ...seatNums.map(String),
        );
        await SeatBooked.update({ cancelled: true }, { where: { bookingId: booking.id, cancelled: false } });
        for (const s of seatNums) await publish(eventId, { seat_num: s, new_status: 0 });
      }
    } else {
      const n = booking.numSeats;
      const r = await redis.eval(lua.CANCEL_GENERAL, 2, keys.avlbl(eventId), keys.book(eventId), String(n));
      await publish(eventId, { avlbl: parseInt(r[0], 10), book: parseInt(r[1], 10) });
    }

    booking.status = 'cancelled';
    await booking.save();
    await syncAvlblCache(ev);
    return res.status(200).json({ ok: true, bookingId: booking.id, status: 'cancelled' });
  } catch (e) {
    console.error('[cancel booking]', e);
    return res.status(500).json({ error: 'cancel failed' });
  }
});

// --------------------------------------------------------------------------
// DELETE /events/:eventid/cancel — partial seat cancel, seat_map ONLY.
// body: { seat_nums: [...] }
// --------------------------------------------------------------------------
router.delete('/events/:eventid/cancel', async (req, res) => {
  const eventId = parseInt(req.params.eventid, 10);
  try {
    const ev = await Event.findByPk(eventId);
    if (!ev) return res.status(404).json({ error: 'event not found' });
    if (ev.model === 'general') {
      return res.status(400).json({ error: 'partial seat cancel not valid for general events' });
    }
    const seatNums = (req.body && req.body.seat_nums) || [];
    if (!Array.isArray(seatNums) || seatNums.length === 0) {
      return res.status(400).json({ error: 'seat_nums required' });
    }
    await ensureEventState(ev);

    // Only this user's still-active seats for this event among the requested ones.
    const rows = await SeatBooked.findAll({
      where: { eventId, seatNum: seatNums, cancelled: false },
    });
    // Verify each row belongs to a booking owned by the caller.
    const bookingIds = [...new Set(rows.map((r) => r.bookingId))];
    const owned = await Booking.findAll({ where: { id: bookingIds, userId: req.userId } });
    const ownedIds = new Set(owned.map((b) => b.id));
    const cancellable = rows.filter((r) => ownedIds.has(r.bookingId));
    if (cancellable.length === 0) return res.status(404).json({ error: 'no cancellable seats found' });

    const cancelSeatNums = cancellable.map((r) => r.seatNum);
    await redis.eval(
      lua.CANCEL_SEATMAP, 3,
      keys.status(eventId), keys.avlbl(eventId), keys.book(eventId),
      ...cancelSeatNums.map(String),
    );
    await SeatBooked.update(
      { cancelled: true },
      { where: { id: cancellable.map((r) => r.id) } },
    );
    for (const s of cancelSeatNums) await publish(eventId, { seat_num: s, new_status: 0 });

    // Decrement each affected booking's num_seats; fully-emptied bookings -> cancelled.
    for (const bid of ownedIds) {
      const removed = cancellable.filter((r) => r.bookingId === bid).length;
      if (removed === 0) continue;
      const booking = await Booking.findByPk(bid);
      const remaining = Math.max(0, booking.numSeats - removed);
      booking.numSeats = remaining;
      if (remaining === 0) booking.status = 'cancelled';
      await booking.save();
    }
    await syncAvlblCache(ev);
    return res.status(200).json({ ok: true, cancelledSeats: cancelSeatNums });
  } catch (e) {
    console.error('[cancel seats]', e);
    return res.status(500).json({ error: 'cancel failed' });
  }
});

// --------------------------------------------------------------------------
// GET /user/bookings/:userid — MUST match JWT subject (IDOR guard).
// --------------------------------------------------------------------------
router.get('/user/bookings/:userid', async (req, res) => {
  const userId = parseInt(req.params.userid, 10);
  if (userId !== req.userId) return res.status(403).json({ error: 'forbidden' });
  try {
    const bookings = await Booking.findAll({ where: { userId }, order: [['created_at', 'DESC']] });
    const eventIds = [...new Set(bookings.map((b) => b.eventId))];
    const events = await Event.findAll({ where: { id: eventIds } });
    const evMap = new Map(events.map((e) => [e.id, e]));

    // Active seats per seat_map booking.
    const seatRows = await SeatBooked.findAll({
      where: { bookingId: bookings.map((b) => b.id), cancelled: false },
    });
    const seatsByBooking = new Map();
    for (const r of seatRows) {
      if (!seatsByBooking.has(r.bookingId)) seatsByBooking.set(r.bookingId, []);
      seatsByBooking.get(r.bookingId).push(r.seatNum);
    }

    const out = bookings.map((b) => {
      const ev = evMap.get(b.eventId);
      return serializeBooking(b, {
        seats: seatsByBooking.get(b.id) || [],
        event: ev
          ? { id: ev.id, name: ev.name, dateTime: ev.dateTime, venue: ev.venue, location: ev.location, model: ev.model, thumbnailurl: ev.thumbnailurl }
          : null,
      });
    });
    return res.json(out);
  } catch (e) {
    console.error('[my bookings]', e);
    return res.status(500).json({ error: 'failed to fetch bookings' });
  }
});

module.exports = router;
