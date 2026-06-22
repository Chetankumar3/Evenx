'use strict';

// All avlbl / book / bitmap mutations in main happen ONLY inside these atomic
// EVAL scripts (master_prompt Sec.7 + Sec.11 guardrail: no plain GET-then-SET).

// ---------------------------------------------------------------------------
// SEAT_MAP CHECKOUT — verify every requested seat's lock is owned by userId,
// then flip each bitmap field to 2 (booked), DEL the lock, INCRBY book.
//   KEYS[1] = <eventid>:status (bitmap)
//   KEYS[2] = <eventid>:book
//   ARGV[1] = userId
//   ARGV[2] = lock-key prefix "<eventid>:lock:"
//   ARGV[3..] = seat numbers
// returns 1 on success, 0 on any ownership mismatch (atomic — no partial commit).
const CHECKOUT_SEATMAP = `
local userId = ARGV[1]
local prefix = ARGV[2]
for i = 3, #ARGV do
  local owner = redis.call('GET', prefix .. ARGV[i])
  if owner ~= userId then
    return 0
  end
end
for i = 3, #ARGV do
  local seat = tonumber(ARGV[i])
  redis.call('BITFIELD', KEYS[1], 'SET', 'u2', '#' .. seat, 2)
  redis.call('DEL', prefix .. ARGV[i])
end
redis.call('INCRBY', KEYS[2], #ARGV - 2)
return 1
`;

// ---------------------------------------------------------------------------
// GENERAL CHECKOUT — verify the count-lock exists, DEL it, INCRBY book by n.
//   KEYS[1] = <eventid>:lock:<n>:<userId>
//   KEYS[2] = <eventid>:book
//   KEYS[3] = <eventid>:avlbl
//   ARGV[1] = n
// returns {1, avlbl, book} on success, {0} if the lock expired.
const CHECKOUT_GENERAL = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('DEL', KEYS[1])
  redis.call('INCRBY', KEYS[2], tonumber(ARGV[1]))
  local book = redis.call('GET', KEYS[2])
  local avlbl = redis.call('GET', KEYS[3])
  return {1, avlbl, book}
else
  return {0}
end
`;

// ---------------------------------------------------------------------------
// SEAT_MAP CANCEL — for each cancelled seat: bitmap field -> 0, avlbl += 1,
// book -= 1. (Atomic, mirrors checkout's discipline.)
//   KEYS[1] = <eventid>:status
//   KEYS[2] = <eventid>:avlbl
//   KEYS[3] = <eventid>:book
//   ARGV[1..] = seat numbers
// returns the new avlbl (int).
const CANCEL_SEATMAP = `
for i = 1, #ARGV do
  local seat = tonumber(ARGV[i])
  redis.call('BITFIELD', KEYS[1], 'SET', 'u2', '#' .. seat, 0)
end
redis.call('INCRBY', KEYS[2], #ARGV)
redis.call('DECRBY', KEYS[3], #ARGV)
return redis.call('GET', KEYS[2])
`;

// ---------------------------------------------------------------------------
// GENERAL CANCEL — avlbl += n, book -= n.
//   KEYS[1] = <eventid>:avlbl
//   KEYS[2] = <eventid>:book
//   ARGV[1] = n
// returns {avlbl, book}.
const CANCEL_GENERAL = `
redis.call('INCRBY', KEYS[1], tonumber(ARGV[1]))
redis.call('DECRBY', KEYS[2], tonumber(ARGV[1]))
return { redis.call('GET', KEYS[1]), redis.call('GET', KEYS[2]) }
`;

module.exports = { CHECKOUT_SEATMAP, CHECKOUT_GENERAL, CANCEL_SEATMAP, CANCEL_GENERAL };
