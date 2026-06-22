'use strict';

const Redis = require('ioredis');
const config = require('./config');

// One shared client for commands + EVAL + PUBLISH. (Pub is fine on a normal
// client; only SUBSCRIBE would require a dedicated connection, which main never does.)
const redis = new Redis(config.redis.url, { db: config.redis.db });

redis.on('error', (err) => console.error('[redis] error', err.message));

module.exports = redis;
