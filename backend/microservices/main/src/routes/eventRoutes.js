'use strict';

const express = require('express');
const { Op } = require('sequelize');
const { Event } = require('../db');
const redis = require('../redis');
const keys = require('../keys');

const router = express.Router();

// Serialize an Event row to the wire shape. availableSeats prefers the live
// Redis avlbl (source of truth) when present, falling back to the DB cache.
function serialize(ev, liveAvlbl) {
  const j = ev.toJSON ? ev.toJSON() : ev;
  return {
    id: j.id,
    code: j.code,
    name: j.name,
    description: j.description,
    artists: j.artists,
    dateTime: j.dateTime,
    venue: j.venue,
    location: j.location,
    totalSeats: j.totalSeats,
    availableSeats: liveAvlbl != null ? liveAvlbl : j.availableSeats,
    price: j.price != null ? Number(j.price) : 0,
    bannerurl: j.bannerurl,
    thumbnailurl: j.thumbnailurl,
    model: j.model,
  };
}

// Overlay live Redis avlbl onto a list of events with a single MGET.
async function withLiveAvlbl(events) {
  if (events.length === 0) return [];
  const avlblKeys = events.map((e) => keys.avlbl(e.id));
  const vals = await redis.mget(avlblKeys);
  return events.map((e, i) => serialize(e, vals[i] != null ? parseInt(vals[i], 10) : null));
}

// GET /events?location=  — PUBLIC. location optional; absent => full list.
router.get('/events', async (req, res) => {
  try {
    const where = {};
    if (req.query.location) where.location = req.query.location;
    const events = await Event.findAll({ where, order: [['dateTime', 'ASC']] });
    return res.json(await withLiveAvlbl(events));
  } catch (e) {
    console.error('[GET /events]', e);
    return res.status(500).json({ error: 'failed to list events' });
  }
});

// GET /event_details/:id — PUBLIC.
router.get('/event_details/:id', async (req, res) => {
  try {
    const ev = await Event.findByPk(req.params.id);
    if (!ev) return res.status(404).json({ error: 'event not found' });
    const live = await redis.get(keys.avlbl(ev.id));
    return res.json(serialize(ev, live != null ? parseInt(live, 10) : null));
  } catch (e) {
    console.error('[GET /event_details]', e);
    return res.status(500).json({ error: 'failed to fetch event' });
  }
});

// GET /search?location=&has_artist=&code=&date_from=&date_to=&q= — PUBLIC, query params.
router.get('/search', async (req, res) => {
  try {
    const { location, has_artist, code, date_from, date_to, q } = req.query;
    const where = {};
    if (location) where.location = location;
    if (code) where.code = code;
    if (has_artist) where.artists = { [Op.iLike]: `%${has_artist}%` };
    if (q) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } },
        { venue: { [Op.iLike]: `%${q}%` } },
        { artists: { [Op.iLike]: `%${q}%` } },
      ];
    }
    if (date_from || date_to) {
      where.dateTime = {};
      if (date_from) where.dateTime[Op.gte] = new Date(date_from);
      if (date_to) where.dateTime[Op.lte] = new Date(date_to);
    }
    const events = await Event.findAll({ where, order: [['dateTime', 'ASC']] });
    return res.json(await withLiveAvlbl(events));
  } catch (e) {
    console.error('[GET /search]', e);
    return res.status(500).json({ error: 'search failed' });
  }
});

module.exports = { router, serialize };
