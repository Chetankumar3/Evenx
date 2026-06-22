'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User } = require('../db');
const redis = require('../redis');
const keys = require('../keys');
const config = require('../config');
const { issueToken, requireAuth } = require('../auth');

const router = express.Router();

// POST /register  body: {name,email,username,mobile,location,address,password}
router.post('/register', async (req, res) => {
  const { name, email, username, mobile, location, address, password } = req.body || {};
  if (!name || !email || !username || !password) {
    return res.status(400).json({ error: 'name, email, username and password are required' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, username, mobile, location, address, hashedPassword });
    return res.status(200).json({ token: issueToken(user.id) });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'email or username already in use' });
    }
    console.error('[register]', e);
    return res.status(500).json({ error: 'registration failed' });
  }
});

// POST /login  body: {username|email, password}
router.post('/login', async (req, res) => {
  const { username, email, password } = req.body || {};
  if ((!username && !email) || !password) {
    return res.status(400).json({ error: 'username or email, and password are required' });
  }
  try {
    const where = username ? { username } : { email };
    const user = await User.findOne({ where: { [Op.and]: [where] } });
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.hashedPassword);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    return res.status(200).json({ token: issueToken(user.id) });
  } catch (e) {
    console.error('[login]', e);
    return res.status(500).json({ error: 'login failed' });
  }
});

// POST /logout  (auth required) — writes the Redis denylist entry for this jti.
router.post('/logout', requireAuth, async (req, res) => {
  const nowSec = Math.floor(Date.now() / 1000);
  const ttl = Math.max(1, (req.claims.exp || nowSec) - nowSec);
  await redis.setex(keys.denylist(req.claims.jti), ttl, '1');
  return res.status(200).json({ ok: true });
});

module.exports = router;
