package main

import (
	"context"
	"database/sql"
	"strconv"

	models "evenx/statesync"
	"github.com/redis/go-redis/v9"
)

// getOrRehydrate returns the event's booking model, rehydrating Redis state from
// the DB (master_prompt Sec.9) if <eventid>:total is missing. Idempotent: if
// state already exists it just returns the cached model.
func getOrRehydrate(ctx context.Context, rdb *redis.Client, db *sql.DB, eventID string) (string, error) {
	// Fast path: already hydrated.
	if exists, _ := rdb.Exists(ctx, kTotal(eventID)).Result(); exists > 0 {
		m, err := rdb.Get(ctx, kModel(eventID)).Result()
		if err == nil && m != "" {
			return m, nil
		}
	}

	id, err := strconv.Atoi(eventID)
	if err != nil {
		return "", err
	}

	var ev models.Event
	row := db.QueryRowContext(ctx, `SELECT total_seats, model FROM events WHERE id = $1`, id)
	if err := row.Scan(&ev.TotalSeats, &ev.Model); err != nil {
		return "", err
	}
	total := ev.TotalSeats
	model := string(ev.Model)

	var book int
	if ev.Model == models.EventModelGeneral {
		row := db.QueryRowContext(ctx,
			`SELECT COALESCE(SUM(num_seats), 0) FROM bookings WHERE event_id = $1 AND status = 'confirmed'`, id)
		if err := row.Scan(&book); err != nil {
			return "", err
		}
	} else {
		row := db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM seats_booked WHERE event_id = $1 AND cancelled = false`, id)
		if err := row.Scan(&book); err != nil {
			return "", err
		}
	}
	avlbl := total - book

	p := rdb.Pipeline()
	p.Set(ctx, kModel(eventID), model, 0)
	p.Set(ctx, kTotal(eventID), total, 0)
	p.Set(ctx, kAvlbl(eventID), avlbl, 0)
	p.Set(ctx, kBook(eventID), book, 0)
	if _, err := p.Exec(ctx); err != nil {
		return "", err
	}

	// seat_map: rebuild the bitmap — bit field = 2 for each currently-booked seat.
	if ev.Model == models.EventModelSeatMap {
		rows, err := db.QueryContext(ctx,
			`SELECT seat_num FROM seats_booked WHERE event_id = $1 AND cancelled = false`, id)
		if err != nil {
			return "", err
		}
		defer rows.Close()
		args := []interface{}{kStatus(eventID)}
		any := false
		for rows.Next() {
			var seat int
			if err := rows.Scan(&seat); err != nil {
				return "", err
			}
			args = append(args, "SET", "u2", "#"+strconv.Itoa(seat), 2)
			any = true
		}
		if any {
			if err := rdb.Do(ctx, append([]interface{}{"BITFIELD"}, args...)...).Err(); err != nil {
				return "", err
			}
		}
	}

	return model, nil
}
