'use strict';

// Redis key builders — EXACTLY the schema in master_prompt.txt Sec.4.
// general never uses lockSeat/status; seat_map never uses lockCount.
module.exports = {
  model: (e) => `${e}:model`,
  total: (e) => `${e}:total`,
  avlbl: (e) => `${e}:avlbl`,
  book: (e) => `${e}:book`,
  status: (e) => `${e}:status`, // seat_map bitmap, 2 bits/seat
  lockSeatPrefix: (e) => `${e}:lock:`, // + <seat_num>  (seat_map)
  lockSeat: (e, seat) => `${e}:lock:${seat}`,
  lockCount: (e, n, userId) => `${e}:lock:${n}:${userId}`, // general
  denylist: (jti) => `jwt:denylist:${jti}`,
  pubsub: (e) => `${e}`, // pubsub channel is the bare eventid
};
