'use strict';

// Load Infra/.env when running outside Docker (in-container env is injected directly).
// dotenv silently no-ops if the path doesn't exist, so this is safe in all environments.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../Infra/templates/.env') });

function int(name, def) {
  const v = process.env[name];
  return v === undefined || v === '' ? def : parseInt(v, 10);
}

module.exports = {
  port: int('MAIN_PORT', 3000),

  jwtSecret: process.env.JWT_SECRET || 'dev_insecure_secret_change_me',
  jwtExpiresSeconds: int('JWT_EXPIRES_SECONDS', 7200), // 2h per spec

  lockTtl: int('LOCK_TTL', 600),
  pricePerSeatDefault: process.env.PRICE_PER_SEAT || '499.00', // only used by seed; real price lives on each event

  frontendOrigin: process.env.FRONTEND_ORIGIN || '*',

  db: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: int('POSTGRES_PORT', 5432),
    database: process.env.POSTGRES_DB || 'evenx',
    user: process.env.POSTGRES_USER || 'evenx',
    password: process.env.POSTGRES_PASSWORD || 'evenx',
    url: process.env.DATABASE_URL || null,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    db: int('REDIS_DB', 0),
  },
};
