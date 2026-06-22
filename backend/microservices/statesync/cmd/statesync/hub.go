package main

import (
	"context"
	"database/sql"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Hub is the Broadcaster for one active event: it owns the Redis pubsub
// subscription for channel <eventid> and fans every delta out to all connected
// clients. It also runs the 30s reconciler. One Hub per active event; torn down
// when its last connection leaves.
type Hub struct {
	eventID string
	model   string
	rdb     *redis.Client
	db      *sql.DB
	cfg     Config

	mu     sync.Mutex
	conns  map[*Conn]struct{}
	pubsub *redis.PubSub
	quit   chan struct{}
}

func (h *Hub) start() {
	h.quit = make(chan struct{})
	h.pubsub = h.rdb.Subscribe(context.Background(), chPubsub(h.eventID))
	go h.pubsubLoop()
	go h.reconcileLoop()
}

func (h *Hub) stop() {
	close(h.quit)
	_ = h.pubsub.Close()
}

// pubsubLoop forwards every Redis pubsub payload verbatim to all room clients.
func (h *Hub) pubsubLoop() {
	ch := h.pubsub.Channel()
	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			h.broadcast([]byte(msg.Payload))
		case <-h.quit:
			return
		}
	}
}

func (h *Hub) reconcileLoop() {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			h.reconcile()
		case <-h.quit:
			return
		}
	}
}

// broadcast pushes a message to every connection's send buffer (non-blocking;
// a saturated slow client simply drops this delta — the 30s reconciler heals it).
func (h *Hub) broadcast(msg []byte) {
	h.mu.Lock()
	for c := range h.conns {
		select {
		case c.send <- msg:
		default:
		}
	}
	h.mu.Unlock()
}

// Manager owns the eventID -> Hub map and the create/teardown lifecycle.
type Manager struct {
	mu   sync.Mutex
	hubs map[string]*Hub
	rdb  *redis.Client
	db   *sql.DB
	cfg  Config
}

func newManager(rdb *redis.Client, db *sql.DB, cfg Config) *Manager {
	return &Manager{hubs: map[string]*Hub{}, rdb: rdb, db: db, cfg: cfg}
}

func (m *Manager) attach(eventID, model string, c *Conn) {
	m.mu.Lock()
	h := m.hubs[eventID]
	if h == nil {
		h = &Hub{eventID: eventID, model: model, rdb: m.rdb, db: m.db, cfg: m.cfg, conns: map[*Conn]struct{}{}}
		m.hubs[eventID] = h
		h.start()
	}
	m.mu.Unlock()

	h.mu.Lock()
	h.conns[c] = struct{}{}
	h.mu.Unlock()
	c.hub = h
}

func (m *Manager) detach(c *Conn) {
	h := c.hub
	if h == nil {
		return
	}
	m.mu.Lock()
	h.mu.Lock()
	delete(h.conns, c)
	empty := len(h.conns) == 0
	h.mu.Unlock()
	if empty {
		h.stop()
		delete(m.hubs, h.eventID)
	}
	m.mu.Unlock()
}
