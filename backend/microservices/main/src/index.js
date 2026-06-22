'use strict';

const express = require('express');
const cors = require('cors');
const config = require('./config');
const { sequelize } = require('./db');
const { requireAuth } = require('./auth');
const authRoutes = require('./routes/authRoutes');
const { router: eventRoutes } = require('./routes/eventRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const { seedIfEmpty } = require('./seed');

const app = express();
app.use(cors({ origin: config.frontendOrigin === '*' ? true : config.frontendOrigin }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

// Public: register + login. (logout lives here too but self-guards with requireAuth.)
app.use(authRoutes);
// Public: the only three unauthenticated GETs in the system.
app.use(eventRoutes);
// Everything past here requires a valid, non-denylisted JWT.
app.use(requireAuth);
app.use(bookingRoutes);

async function start() {
  await sequelize.authenticate();
  await sequelize.sync(); // creates tables from models.js on a fresh DB
  await seedIfEmpty();
  app.listen(config.port, () => console.log(`[main] listening on :${config.port}`));
}

start().catch((e) => {
  console.error('[main] failed to start', e);
  process.exit(1);
});
