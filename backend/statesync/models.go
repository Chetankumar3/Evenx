// Package models -- read-only schema mirror for StateSync rehydration queries. No writes happen here.
package models

import "time"

// EventModel mirrors the events.model enum.
type EventModel string

const (
	EventModelGeneral EventModel = "general"
	EventModelSeatMap EventModel = "seat_map"
)

// BookingStatus mirrors the bookings.status enum.
type BookingStatus string

const (
	BookingConfirmed BookingStatus = "confirmed"
	BookingCancelled BookingStatus = "cancelled"
)

// Event -- read on rehydration to get total_seats/model; avlbl/book live in Redis.
type Event struct {
	ID             int        `db:"id"`
	Code           string     `db:"code"`
	Name           string     `db:"name"`
	Description    *string    `db:"description"`
	Artists        *string    `db:"artists"`
	DateTime       time.Time  `db:"date_time"`
	Venue          string     `db:"venue"`
	Location       string     `db:"location"`
	TotalSeats     int        `db:"total_seats"`
	AvailableSeats int        `db:"available_seats"`
	BannerURL      *string    `db:"bannerurl"`
	ThumbnailURL   *string    `db:"thumbnailurl"`
	Model          EventModel `db:"model"`
	CreatedAt      time.Time  `db:"created_at"`
	UpdatedAt      time.Time  `db:"updated_at"`
}

// Booking -- read during rehydration to recompute `book` (SUM num_seats WHERE status='confirmed').
type Booking struct {
	ID         int           `db:"id"`
	UserID     int           `db:"user_id"`
	EventID    int           `db:"event_id"`
	NumSeats   int           `db:"num_seats"`
	Status     BookingStatus `db:"status"`
	Amount     *float64      `db:"amount"`
	PaymentRef *string       `db:"payment_ref"`
	CreatedAt  time.Time     `db:"created_at"`
	UpdatedAt  time.Time     `db:"updated_at"`
}

// SeatBooked -- read during rehydration to rebuild the seat_map bitmap (one row per booked seat).
type SeatBooked struct {
	ID        int       `db:"id"`
	BookingID int       `db:"booking_id"`
	EventID   int       `db:"event_id"`
	SeatNum   int       `db:"seat_num"`
	CreatedAt time.Time `db:"created_at"`
	Cancelled bool      `db:"cancelled"`
}