'use strict';

// Lazy rehydration helper (master_prompt Sec.9), used defensively in main before
// a checkout/cancel touches Redis. Normally statesync rehydrates on WS connect;
// this guards the case where Redis state was evicted but a user still cancels an
// old booking. If <eventid>:total already exists, this is a no-op.
const redis = require('./redis');
const keys = require('./keys');
const { Booking, SeatBooked } = require('./db');

async function ensureEventState(ev) {
  const e = ev.id;
  if (await redis.exists(keys.total(e))) return;

  const total = ev.totalSeats;
  let book;
  if (ev.model === 'general') {
    book = (await Booking.sum('numSeats', { where: { eventId: e, status: 'confirmed' } })) || 0;
  } else {
    book = await SeatBooked.count({ where: { eventId: e, cancelled: false } });
  }
  const avlbl = total - book;

  const p = redis.pipeline();
  p.set(keys.model(e), ev.model);
  p.set(keys.total(e), total);
  p.set(keys.avlbl(e), avlbl);
  p.set(keys.book(e), book);
  await p.exec();

  if (ev.model === 'seat_map') {
    const seats = await SeatBooked.findAll({ where: { eventId: e, cancelled: false } });
    if (seats.length) {
      const args = [keys.status(e)];
      for (const s of seats) args.push('SET', 'u2', `#${s.seatNum}`, 2);
      await redis.bitfield(...args);
    }
  }
}

module.exports = { ensureEventState };
