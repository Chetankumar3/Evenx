package main

import (
	"context"
	"encoding/base64"
	"strconv"
	"strings"

	models "evenx/statesync"
	"github.com/redis/go-redis/v9"
)

// reconcile runs every 30s per active event (Sec.6). It repairs avlbl drift for
// general events by summing the live count-locks, and re-broadcasts the seat_map
// bitmap so any client that missed a delta resynchronizes.
func (h *Hub) reconcile() {
	ctx := context.Background()

	if h.model == string(models.EventModelGeneral) {
		total, _ := h.rdb.Get(ctx, kTotal(h.eventID)).Int64()
		book, _ := h.rdb.Get(ctx, kBook(h.eventID)).Int64()

		var sum int64
		iter := h.rdb.Scan(ctx, 0, h.eventID+":lock:*", 200).Iterator()
		for iter.Next(ctx) {
			parts := strings.Split(iter.Val(), ":")
			if len(parts) == 4 { // <eventid>:lock:<count>:<userid>
				if n, err := strconv.ParseInt(parts[2], 10, 64); err == nil {
					sum += n
				}
			}
		}

		avlblCheck := total - book - sum
		if cur, err := h.rdb.Get(ctx, kAvlbl(h.eventID)).Int64(); err != nil || cur != avlblCheck {
			h.rdb.Set(ctx, kAvlbl(h.eventID), avlblCheck, 0) // documented drift fix (Sec.6)
		}
		h.broadcast(mustJSON(deltaGeneral{Avlbl: avlblCheck, Book: book}))
		return
	}

	// seat_map: refresh from the authoritative bitmap.
	b, err := h.rdb.Get(ctx, kStatus(h.eventID)).Bytes()
	if err != nil && err != redis.Nil {
		return
	}
	h.broadcast(mustJSON(initSeatmap{Type: typeInit, Bitmap: base64.StdEncoding.EncodeToString(b)}))
}
