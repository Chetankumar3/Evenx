package main

import "encoding/json"

// Wire formats — field names MUST match frontend/src/contract/contract.json
// (ws.envelopeFields / ws.serverTypes / ws.clientActions) and main's publishes.

const (
	actionLock   = "LOCK"
	actionUnlock = "UNLOCK"
	actionDone   = "DONE"
	typeInit     = "INIT"
)

// Incoming client message (one struct covers both models + the auth handshake).
type clientMsg struct {
	Token    string          `json:"token,omitempty"`
	Reqid    json.RawMessage `json:"reqid,omitempty"`
	Action   string          `json:"action,omitempty"`
	SeatNum  []int           `json:"seat_num,omitempty"`
	NumSeats int             `json:"num_seats,omitempty"`
}

// Server -> client.
type initSeatmap struct {
	Type   string `json:"type"`
	Bitmap string `json:"bitmap"` // base64 of the 2-bit-per-seat status bitmap
}

type initGeneral struct {
	Type  string `json:"type"`
	Avlbl int64  `json:"avlbl"`
	Book  int64  `json:"book"`
}

type lockAck struct {
	Reqid       json.RawMessage `json:"reqid,omitempty"`
	Success     bool            `json:"success"`
	Avlbl       *int64          `json:"avlbl,omitempty"`
	FailedSeats []int           `json:"failed_seats,omitempty"`
}

type unlockAck struct {
	Reqid   json.RawMessage `json:"reqid,omitempty"`
	Success bool            `json:"success"`
}

// Pubsub deltas published by statesync (forwarded verbatim to all room clients).
type deltaSeat struct {
	SeatNum   int `json:"seat_num"`
	NewStatus int `json:"new_status"`
}

type deltaGeneral struct {
	Avlbl int64 `json:"avlbl"`
	Book  int64 `json:"book"`
}

func mustJSON(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}
