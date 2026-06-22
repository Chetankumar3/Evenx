package main

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	models "evenx/statesync"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true }, // first-message auth gates access, not Origin
}

// Server wires the WS handler to its dependencies.
type Server struct {
	cfg Config
	rdb *redis.Client
	db  *sql.DB
	mgr *Manager
}

// Conn is one authenticated WS client. ownership state (c.seats / c.countHeld)
// is touched only by the single readLoop goroutine, so it needs no lock.
type Conn struct {
	ws       *websocket.Conn
	userID   string
	eventID  string
	model    string
	send     chan []byte
	done     chan struct{}
	released bool

	seats     map[int]struct{} // seat_map: seats this conn currently holds
	countHeld int              // general: count this conn currently holds
	hub       *Hub
}

func (c *Conn) enqueue(b []byte) {
	select {
	case c.send <- b:
	case <-c.done:
	}
}

func (c *Conn) writePump() {
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			_ = c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.ws.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-c.done:
			return
		}
	}
}

func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	eventID := strings.TrimPrefix(r.URL.Path, "/stream/")
	if eventID == "" || strings.Contains(eventID, "/") {
		http.Error(w, "bad event id", http.StatusBadRequest)
		return
	}

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	c := &Conn{
		ws:      ws,
		eventID: eventID,
		send:    make(chan []byte, 64),
		done:    make(chan struct{}),
		seats:   map[int]struct{}{},
	}

	// First-message auth: accept the socket, then require {token} within 10s.
	_ = ws.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, data, err := ws.ReadMessage()
	if err != nil {
		ws.Close()
		return
	}
	var first clientMsg
	if json.Unmarshal(data, &first) != nil || first.Token == "" {
		_ = ws.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "auth required"))
		ws.Close()
		return
	}
	userID, err := verifyToken(context.Background(), s.rdb, s.cfg.JWTSecret, first.Token)
	if err != nil {
		_ = ws.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "unauthorized"))
		ws.Close()
		return
	}
	c.userID = userID
	_ = ws.SetReadDeadline(time.Time{}) // clear deadline for the lifetime of the conn

	ctx := context.Background()

	// Ensure Redis state exists (rehydrate on cache miss) and learn the model.
	model, err := getOrRehydrate(ctx, s.rdb, s.db, eventID)
	if err != nil {
		ws.Close()
		return
	}
	c.model = model

	// Write INIT directly (writePump not started yet, no other writer exists) so it
	// is guaranteed to be the first frame, THEN attach to the hub and start the
	// writer. Any delta in the microsecond gap is healed by the 30s reconciler.
	if err := s.sendInit(ctx, c); err != nil {
		ws.Close()
		return
	}
	s.mgr.attach(eventID, model, c)
	go c.writePump()

	s.readLoop(ctx, c)

	// Teardown: stop receiving, run abandonment cleanup unless DONE was received.
	s.mgr.detach(c)
	if !c.released {
		s.abandon(ctx, c)
	}
	close(c.done)
	ws.Close()
}

// sendInit writes the initial snapshot directly to the socket. Safe to call
// before writePump starts: it is the only writer at that point.
func (s *Server) sendInit(ctx context.Context, c *Conn) error {
	var b []byte
	if c.model == string(models.EventModelSeatMap) {
		bitmap, err := s.rdb.Get(ctx, kStatus(c.eventID)).Bytes()
		if err != nil && err != redis.Nil {
			return err
		}
		b = mustJSON(initSeatmap{Type: typeInit, Bitmap: base64.StdEncoding.EncodeToString(bitmap)})
	} else {
		avlbl, _ := s.rdb.Get(ctx, kAvlbl(c.eventID)).Int64()
		book, _ := s.rdb.Get(ctx, kBook(c.eventID)).Int64()
		b = mustJSON(initGeneral{Type: typeInit, Avlbl: avlbl, Book: book})
	}
	_ = c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return c.ws.WriteMessage(websocket.TextMessage, b)
}

func (s *Server) readLoop(ctx context.Context, c *Conn) {
	for {
		_, data, err := c.ws.ReadMessage()
		if err != nil {
			return
		}
		var m clientMsg
		if json.Unmarshal(data, &m) != nil {
			continue
		}
		switch m.Action {
		case actionDone:
			// Graceful-close handshake: mark released, server then closes (Sec.6).
			c.released = true
			return
		case actionLock:
			if c.model == string(models.EventModelSeatMap) {
				s.lockSeatmap(ctx, c, &m)
			} else {
				s.lockGeneral(ctx, c, &m)
			}
		case actionUnlock:
			if c.model == string(models.EventModelSeatMap) {
				s.unlockSeatmap(ctx, c, &m)
			}
		}
	}
}

// ---- seat_map LOCK ----
func (s *Server) lockSeatmap(ctx context.Context, c *Conn, m *clientMsg) {
	if len(m.SeatNum) == 0 {
		c.enqueue(mustJSON(lockAck{Reqid: m.Reqid, Success: false}))
		return
	}
	args := []interface{}{c.userID, s.cfg.LockTTL, kLockSeatPrefix(c.eventID)}
	for _, seat := range m.SeatNum {
		args = append(args, seat)
	}
	raw, err := luaLockSeatmap.Run(ctx, s.rdb,
		[]string{kStatus(c.eventID), kAvlbl(c.eventID)}, args...).Result()
	if err != nil {
		c.enqueue(mustJSON(lockAck{Reqid: m.Reqid, Success: false}))
		return
	}
	arr, _ := raw.([]interface{})
	if len(arr) == 0 || asInt(arr[0]) != 1 {
		failed := make([]int, 0, len(arr)-1)
		for _, v := range arr[1:] {
			failed = append(failed, asInt(v))
		}
		c.enqueue(mustJSON(lockAck{Reqid: m.Reqid, Success: false, FailedSeats: failed}))
		return
	}
	for _, seat := range m.SeatNum {
		c.seats[seat] = struct{}{}
	}
	avlbl, _ := s.rdb.Get(ctx, kAvlbl(c.eventID)).Int64()
	c.enqueue(mustJSON(lockAck{Reqid: m.Reqid, Success: true, Avlbl: &avlbl}))
	for _, seat := range m.SeatNum {
		_ = s.rdb.Publish(ctx, chPubsub(c.eventID), mustJSON(deltaSeat{SeatNum: seat, NewStatus: 1})).Err()
	}
}

// ---- seat_map UNLOCK (manual) ----
func (s *Server) unlockSeatmap(ctx context.Context, c *Conn, m *clientMsg) {
	if len(m.SeatNum) == 0 {
		c.enqueue(mustJSON(unlockAck{Reqid: m.Reqid, Success: true}))
		return
	}
	released := s.releaseSeats(ctx, c, m.SeatNum)
	c.enqueue(mustJSON(unlockAck{Reqid: m.Reqid, Success: true}))
	for _, seat := range released {
		_ = s.rdb.Publish(ctx, chPubsub(c.eventID), mustJSON(deltaSeat{SeatNum: seat, NewStatus: 0})).Err()
	}
}

// releaseSeats runs the ownership-checked unlock Lua and updates the conn's set.
func (s *Server) releaseSeats(ctx context.Context, c *Conn, seats []int) []int {
	args := []interface{}{c.userID, kLockSeatPrefix(c.eventID)}
	for _, seat := range seats {
		args = append(args, seat)
	}
	raw, err := luaUnlockSeatmap.Run(ctx, s.rdb,
		[]string{kStatus(c.eventID), kAvlbl(c.eventID)}, args...).Result()
	if err != nil {
		return nil
	}
	arr, _ := raw.([]interface{})
	released := make([]int, 0, len(arr))
	for _, v := range arr {
		seat := asInt(v)
		released = append(released, seat)
		delete(c.seats, seat)
	}
	return released
}

// ---- general LOCK ----
func (s *Server) lockGeneral(ctx context.Context, c *Conn, m *clientMsg) {
	n := m.NumSeats
	if n <= 0 {
		c.enqueue(mustJSON(lockAck{Reqid: m.Reqid, Success: false}))
		return
	}
	raw, err := luaLockGeneral.Run(ctx, s.rdb,
		[]string{kAvlbl(c.eventID), kBook(c.eventID)},
		kLockCount(c.eventID, n, c.userID), n, s.cfg.LockTTL).Result()
	if err != nil {
		c.enqueue(mustJSON(lockAck{Reqid: m.Reqid, Success: false}))
		return
	}
	arr, _ := raw.([]interface{})
	avlbl := asInt64(arr[1])
	if asInt(arr[0]) != 1 {
		c.enqueue(mustJSON(lockAck{Reqid: m.Reqid, Success: false, Avlbl: &avlbl}))
		return
	}
	c.countHeld = n
	book := asInt64(arr[2])
	c.enqueue(mustJSON(lockAck{Reqid: m.Reqid, Success: true, Avlbl: &avlbl}))
	_ = s.rdb.Publish(ctx, chPubsub(c.eventID), mustJSON(deltaGeneral{Avlbl: avlbl, Book: book})).Err()
}

// abandon releases everything this conn still holds when it disconnects without DONE.
func (s *Server) abandon(ctx context.Context, c *Conn) {
	if c.model == string(models.EventModelSeatMap) {
		if len(c.seats) == 0 {
			return
		}
		seats := make([]int, 0, len(c.seats))
		for seat := range c.seats {
			seats = append(seats, seat)
		}
		released := s.releaseSeats(ctx, c, seats)
		for _, seat := range released {
			_ = s.rdb.Publish(ctx, chPubsub(c.eventID), mustJSON(deltaSeat{SeatNum: seat, NewStatus: 0})).Err()
		}
		return
	}
	if c.countHeld > 0 {
		n := c.countHeld
		res, err := luaUnlockGeneral.Run(ctx, s.rdb,
			[]string{kAvlbl(c.eventID)}, kLockCount(c.eventID, n, c.userID), n).Result()
		c.countHeld = 0
		if err == nil && asInt(res) == 1 {
			avlbl, _ := s.rdb.Get(ctx, kAvlbl(c.eventID)).Int64()
			book, _ := s.rdb.Get(ctx, kBook(c.eventID)).Int64()
			_ = s.rdb.Publish(ctx, chPubsub(c.eventID), mustJSON(deltaGeneral{Avlbl: avlbl, Book: book})).Err()
		}
	}
}

// asInt / asInt64 normalize Lua return values (int64 or string) to numbers.
func asInt(v interface{}) int {
	switch x := v.(type) {
	case int64:
		return int(x)
	case string:
		n, _ := strconv.Atoi(x)
		return n
	default:
		return 0
	}
}

func asInt64(v interface{}) int64 {
	switch x := v.(type) {
	case int64:
		return x
	case string:
		n, _ := strconv.ParseInt(x, 10, 64)
		return n
	default:
		return 0
	}
}
