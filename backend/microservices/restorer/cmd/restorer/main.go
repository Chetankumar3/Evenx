// Restorer — a pure Redis keyspace-notification consumer. On a lock TTL expiry it
// returns the held capacity and publishes the resulting delta. NO DB, NO auth, NO
// shared schema (master_prompt Sec.8). If you find yourself adding either, stop.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	addr := getenv("REDIS_ADDR", "localhost:6379")
	db := 0
	if n, err := strconv.Atoi(os.Getenv("REDIS_DB")); err == nil {
		db = n
	}

	rdb := redis.NewClient(&redis.Options{Addr: addr, DB: db})
	ctx := context.Background()

	// Best-effort: ensure expired-key notifications are on. (Ex = keyevent + expired.)
	if err := rdb.ConfigSet(ctx, "notify-keyspace-events", "Ex").Err(); err != nil {
		log.Printf("[restorer] could not set notify-keyspace-events (continuing): %v", err)
	}

	channel := fmt.Sprintf("__keyevent@%d__:expired", db)
	for {
		if err := consume(ctx, rdb, channel); err != nil {
			log.Printf("[restorer] subscription error, retrying in 2s: %v", err)
			time.Sleep(2 * time.Second)
		}
	}
}

func consume(ctx context.Context, rdb *redis.Client, channel string) error {
	sub := rdb.Subscribe(ctx, channel)
	defer sub.Close()
	if _, err := sub.Receive(ctx); err != nil {
		return err
	}
	log.Printf("[restorer] listening on %s", channel)
	for msg := range sub.Channel() {
		handleExpiry(ctx, rdb, msg.Payload)
	}
	return nil
}

// handleExpiry recovers capacity from an expired lock key name (the value is gone
// by the time the notification fires — everything we need lives in the key name).
func handleExpiry(ctx context.Context, rdb *redis.Client, key string) {
	parts := strings.Split(key, ":")
	if len(parts) < 3 || parts[1] != "lock" {
		return // not a booking lock (e.g. jwt:denylist:* expirations)
	}
	eventID := parts[0]

	switch len(parts) {
	case 3: // seat_map: <eventid>:lock:<seat_num>
		seatNum := parts[2]
		pipe := rdb.Pipeline()
		pipe.Do(ctx, "BITFIELD", eventID+":status", "SET", "u2", "#"+seatNum, 0)
		pipe.Incr(ctx, eventID+":avlbl")
		if _, err := pipe.Exec(ctx); err != nil {
			log.Printf("[restorer] seat_map restore failed for %s: %v", key, err)
			return
		}
		seat, _ := strconv.Atoi(seatNum)
		publish(ctx, rdb, eventID, map[string]interface{}{"seat_num": seat, "new_status": 0})

	case 4: // general: <eventid>:lock:<N>:<userid>
		n, err := strconv.Atoi(parts[2])
		if err != nil {
			return
		}
		if err := rdb.IncrBy(ctx, eventID+":avlbl", int64(n)).Err(); err != nil {
			log.Printf("[restorer] general restore failed for %s: %v", key, err)
			return
		}
		publish(ctx, rdb, eventID, map[string]interface{}{"avlbl_delta": n})
	}
}

func publish(ctx context.Context, rdb *redis.Client, eventID string, payload map[string]interface{}) {
	b, _ := json.Marshal(payload)
	if err := rdb.Publish(ctx, eventID, b).Err(); err != nil {
		log.Printf("[restorer] publish failed for %s: %v", eventID, err)
	}
}
