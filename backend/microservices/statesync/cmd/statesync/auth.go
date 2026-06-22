package main

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

// verifyToken implements the same logic as main's middleware (Sec.3), natively:
// HS256 verify, then Redis denylist check on jti. Returns the userId as a string
// (matches the lock-value format main writes/compares against).
func verifyToken(ctx context.Context, rdb *redis.Client, secret, tokenStr string) (string, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return "", errors.New("invalid token")
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return "", errors.New("invalid claims")
	}

	jti, _ := claims["jti"].(string)
	if jti != "" {
		exists, _ := rdb.Exists(ctx, kDenylist(jti)).Result()
		if exists > 0 {
			return "", errors.New("token denylisted")
		}
	}

	// sub is a JSON number (main signs sub: user.id) -> arrives as float64.
	switch v := claims["sub"].(type) {
	case float64:
		return strconv.FormatInt(int64(v), 10), nil
	case string:
		return v, nil
	default:
		return "", errors.New("missing sub")
	}
}
