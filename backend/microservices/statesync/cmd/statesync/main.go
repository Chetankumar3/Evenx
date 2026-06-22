package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"time"

	_ "github.com/lib/pq"
)

func main() {
	cfg := loadConfig()

	rdb := newRedis(cfg)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("[statesync] warning: redis ping failed: %v", err)
	}
	cancel()

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[statesync] db open: %v", err)
	}
	db.SetMaxOpenConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)

	mgr := newManager(rdb, db, cfg)
	s := &Server{cfg: cfg, rdb: rdb, db: db, mgr: mgr}

	mux := http.NewServeMux()
	mux.HandleFunc("/stream/", s.handleStream)
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	addr := ":" + cfg.Port
	log.Printf("[statesync] listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("[statesync] server: %v", err)
	}
}
