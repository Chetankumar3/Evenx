package main

import (
	"os"
	"strconv"
)

// Config is loaded from the single shared env (Infra/.env), injected into the container.
type Config struct {
	Port        string
	RedisAddr   string
	RedisDB     int
	JWTSecret   string
	LockTTL     int // seconds
	DatabaseURL string
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func atoi(s string, def int) int {
	if s == "" {
		return def
	}
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}

func loadConfig() Config {
	return Config{
		Port:        getenv("STATESYNC_PORT", "8080"),
		RedisAddr:   getenv("REDIS_ADDR", "localhost:6379"),
		RedisDB:     atoi(os.Getenv("REDIS_DB"), 0),
		JWTSecret:   getenv("JWT_SECRET", "dev_insecure_secret_change_me"),
		LockTTL:     atoi(os.Getenv("LOCK_TTL"), 600),
		DatabaseURL: getenv("DATABASE_URL", "postgres://evenx:evenx@localhost:5432/evenx?sslmode=disable"),
	}
}
