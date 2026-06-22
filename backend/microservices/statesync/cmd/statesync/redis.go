package main

import (
	"fmt"

	"github.com/redis/go-redis/v9"
)

// Redis key builders — EXACTLY the schema in master_prompt.txt Sec.4. Must stay
// byte-for-byte identical to main's keys.js and restorer's key parsing.
func kModel(e string) string  { return e + ":model" }
func kTotal(e string) string  { return e + ":total" }
func kAvlbl(e string) string  { return e + ":avlbl" }
func kBook(e string) string   { return e + ":book" }
func kStatus(e string) string { return e + ":status" } // seat_map bitmap
func kLockSeatPrefix(e string) string {
	return e + ":lock:"
} // + <seat_num> (seat_map)
func kLockSeat(e string, seat int) string { return fmt.Sprintf("%s:lock:%d", e, seat) }
func kLockCount(e string, n int, userID string) string {
	return fmt.Sprintf("%s:lock:%d:%s", e, n, userID)
}
func kDenylist(jti string) string { return "jwt:denylist:" + jti }
func chPubsub(e string) string    { return e } // pubsub channel is the bare eventid

func newRedis(cfg Config) *redis.Client {
	return redis.NewClient(&redis.Options{
		Addr: cfg.RedisAddr,
		DB:   cfg.RedisDB,
	})
}

// ---------------------------------------------------------------------------
// Lua scripts — every avlbl/bitmap mutation lives inside one of these (Sec.6 +
// the Sec.11 "no plain GET-then-SET" guardrail).
// ---------------------------------------------------------------------------

// seat_map LOCK. All-or-nothing: if any requested seat is non-empty, commit
// nothing and return {0, <failed seats...>}. On success return {1}.
//   KEYS[1]=status  KEYS[2]=avlbl
//   ARGV[1]=userId  ARGV[2]=ttl  ARGV[3]=lockPrefix  ARGV[4..]=seat numbers
var luaLockSeatmap = redis.NewScript(`
local failed = {}
for i = 4, #ARGV do
  local seat = tonumber(ARGV[i])
  local cur = redis.call('BITFIELD', KEYS[1], 'GET', 'u2', '#' .. seat)
  if cur[1] ~= 0 then
    table.insert(failed, ARGV[i])
  end
end
if #failed > 0 then
  local res = {0}
  for _, s in ipairs(failed) do table.insert(res, s) end
  return res
end
for i = 4, #ARGV do
  local seat = tonumber(ARGV[i])
  redis.call('BITFIELD', KEYS[1], 'SET', 'u2', '#' .. seat, 1)
  redis.call('SET', ARGV[3] .. ARGV[i], ARGV[1], 'EX', tonumber(ARGV[2]))
  redis.call('DECR', KEYS[2])
end
return {1}
`)

// seat_map UNLOCK (manual + abandonment). Only releases seats whose lock is
// owned by this user. Returns the list of seat numbers actually released.
//   KEYS[1]=status  KEYS[2]=avlbl
//   ARGV[1]=userId  ARGV[2]=lockPrefix  ARGV[3..]=seat numbers
var luaUnlockSeatmap = redis.NewScript(`
local done = {}
for i = 3, #ARGV do
  local seat = ARGV[i]
  local owner = redis.call('GET', ARGV[2] .. seat)
  if owner == ARGV[1] then
    redis.call('BITFIELD', KEYS[1], 'SET', 'u2', '#' .. tonumber(seat), 0)
    redis.call('DEL', ARGV[2] .. seat)
    redis.call('INCR', KEYS[2])
    table.insert(done, seat)
  end
end
return done
`)

// general LOCK. If avlbl >= n: avlbl -= n, SETEX count-lock, return {1, avlbl, book}.
// Else return {0, avlbl, book}.
//   KEYS[1]=avlbl  KEYS[2]=book
//   ARGV[1]=lockKey  ARGV[2]=n  ARGV[3]=ttl
var luaLockGeneral = redis.NewScript(`
local n = tonumber(ARGV[2])
local avlbl = tonumber(redis.call('GET', KEYS[1]))
if avlbl == nil then avlbl = 0 end
if avlbl >= n then
  redis.call('DECRBY', KEYS[1], n)
  redis.call('SET', ARGV[1], 'true', 'EX', tonumber(ARGV[3]))
  return {1, redis.call('GET', KEYS[1]), redis.call('GET', KEYS[2])}
else
  return {0, redis.call('GET', KEYS[1]), redis.call('GET', KEYS[2])}
end
`)

// general UNLOCK (abandonment only). If the count-lock still exists: DEL it and
// give the seats back (avlbl += n). Returns 1 if released, 0 if already gone.
//   KEYS[1]=avlbl
//   ARGV[1]=lockKey  ARGV[2]=n
var luaUnlockGeneral = redis.NewScript(`
if redis.call('EXISTS', ARGV[1]) == 1 then
  redis.call('DEL', ARGV[1])
  redis.call('INCRBY', KEYS[1], tonumber(ARGV[2]))
  return 1
end
return 0
`)
