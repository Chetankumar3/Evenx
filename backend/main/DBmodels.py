"""
DB models for the Event Booking System.

Two booking models per event, selected by Event.model:
  - 'general'  : count-based booking. Booking.num_seats holds the count.
                 SeatBooked rows are created for these bookings.
  - 'seat_map' : seat-level reservation booking. Each reserved seat gets
                 a SeatBooked row linked to the Booking.

Redis is the real-time, concurrency-safe source of truth for availability
(avlbl / bitmap / locks). The columns here (available_seats, num_seats,
status) are the persistent record + an eventually-consistent display cache,
synced at checkout/cancel time only -- not on every lock/unlock.
"""

import enum
import uuid

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    Numeric,
    Enum as SAEnum,
    Index,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class EventModel(str, enum.Enum):
    GENERAL = "general"     # count-based, matches the assessment brief
    SEAT_MAP = "seat_map"   # seat-level reservation, enhancement


class BookingStatus(str, enum.Enum):
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


def _fake_payment_ref() -> str:
    """Generates a fake payment gateway reference for the always-succeeding
    mock checkout flow (no real gateway, no webhook)."""
    return f"FAKE-{uuid.uuid4()}"


class User(Base):
    __tablename__ = "user"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    email = Column(String(160), nullable=False, unique=True, index=True)
    location = Column(String(120), nullable=True)
    address = Column(Text, nullable=True)
    username = Column(String(60), nullable=False, unique=True, index=True)
    mobile = Column(String(20), nullable=True)
    hashed_password = Column(String(255), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
x
    bookings = relationship("Booking", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User id={self.id} username={self.username!r}>"


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(6), nullable=False, unique=True, index=True)  # shareable slug

    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    artists = Column(Text, nullable=True)  # comma-separated or JSON-encoded list;
                                            # normalize into its own table later if time permits
    date_time = Column(DateTime(timezone=True), nullable=False)
    venue = Column(String(200), nullable=False)
    location = Column(String(120), nullable=False, index=True)

    total_seats = Column(Integer, nullable=False)
    # Eventually-consistent display cache. Synced on checkout/cancel only.
    # Redis avlbl/bitmap is the real-time, concurrency-safe source of truth.
    available_seats = Column(Integer, nullable=False)

    bannerurl = Column(String(500), nullable=True)
    thumbnailurl = Column(String(500), nullable=True)

    model = Column(
        SAEnum(EventModel, name="event_model"),
        nullable=False,
        default=EventModel.GENERAL,
        server_default=EventModel.GENERAL.value,
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    bookings = relationship("Booking", back_populates="event", cascade="all, delete-orphan")
    seats_booked = relationship("SeatBooked", back_populates="event", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_events_location_date", "location", "date_time"),
    )

    def __repr__(self):
        return f"<Event id={self.id} code={self.code!r} model={self.model}>"


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)

    # For model == 'general': the count booked.
    # For model == 'seat_map': len(seats_booked) for this booking, kept in
    # sync for fast reads without joining seats_booked every time.
    num_seats = Column(Integer, nullable=False)

    status = Column(
        SAEnum(BookingStatus, name="booking_status"),
        nullable=False,
        default=BookingStatus.CONFIRMED,
        server_default=BookingStatus.CONFIRMED.value,
    )

    # Fake payment gateway fields -- no real gateway, no webhook. The
    # checkout endpoint itself stamps these on success.
    amount = Column(Numeric(10, 2), nullable=True)
    payment_ref = Column(String(80), nullable=True, default=_fake_payment_ref)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User", back_populates="bookings")
    event = relationship("Event", back_populates="bookings")
    seats = relationship("SeatBooked", back_populates="booking", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_bookings_user_event", "user_id", "event_id"),
    )

    def __repr__(self):
        return f"<Booking id={self.id} event_id={self.event_id} status={self.status}>"


class SeatBooked(Base):
    """Only populated for bookings where Event.model == 'seat_map'.
    Rows are hard-deleted on cancellation (booking history lives on the
    Booking row itself, not here)."""

    __tablename__ = "seats_booked"

    id = Column(Integer, primary_key=True, autoincrement=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False, index=True)
    # Denormalized for fast per-event seat lookups without joining bookings.
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)

    seat_num = Column(Integer, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    booking = relationship("Booking", back_populates="seats")
    event = relationship("Event", back_populates="seats_booked")

    __table_args__ = (
        # NOTE: deliberately NOT a hard unique constraint on (event_id, seat_num).
        # Redis (bitmap + per-seat lock, atomic Lua) is the actual concurrency
        # guard against double-booking a seat. This index is for query speed
        # only. Cancelled bookings hard-delete their rows here, so a seat_num
        # is free to be reused by a later booking without constraint conflicts.
        Index("ix_seats_booked_event_seat", "event_id", "seat_num"),
    )

    def __repr__(self):
        return f"<SeatBooked event_id={self.event_id} seat_num={self.seat_num}>"