'use strict';

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const redis = require('./redis');
const keys = require('./keys');

// Issue a JWT: { sub, jti, iat, exp }, HS256, exp = iat + 2h (Sec.3).
function issueToken(userId) {
  return jwt.sign({ sub: userId, jti: uuidv4() }, config.jwtSecret, {
    expiresIn: config.jwtExpiresSeconds,
  });
}

// Express middleware — protects every route except the three public GETs.
// Verifies signature, then checks the Redis denylist for this jti.
async function requireAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).end();
    const claims = jwt.verify(token, config.jwtSecret);
    if (await redis.exists(keys.denylist(claims.jti))) return res.status(401).end();
    req.userId = claims.sub;
    req.claims = claims;
    return next();
  } catch (_e) {
    return res.status(401).end();
  }
}

module.exports = { issueToken, requireAuth };
