import { useCallback, useEffect, useState } from 'react'
import api from '../api/client'
import { C } from '../contract'
import { useAuth } from '../auth/AuthContext'
import Spinner from '../components/Spinner'
import { formatMoney } from '../lib/format'

// booking field accessors (contract.fields.booking order):
// 0 id, 1 userId, 2 eventId, 3 numSeats, 4 status, 5 amount,
// 6 paymentRef, 7 createdAt, 8 seats
const B = C.fields.booking

// Normalize a seat row to a numeric seat number. seats_booked rows may be
// objects ({seatNum} / {seat_num}) or bare ints.
function seatNumOf(seat) {
  if (seat && typeof seat === 'object') {
    return Number(seat.seatNum ?? seat.seat_num ?? seat.num)
  }
  return Number(seat)
}

export default function MyBookings() {
  const { userId } = useAuth()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.myBookings(userId)
      setBookings(Array.isArray(data) ? data : data?.bookings || [])
    } catch (err) {
      setError(err.message || 'Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  async function cancelWholeBooking(booking) {
    setBusyId(booking[B[0]])
    try {
      await api.cancelBooking(booking[B[2]], booking[B[0]])
      setNotice(C.messages.bookingCancelled)
      await load()
    } catch (err) {
      setError(err.body?.message || err.message || 'Cancel failed')
    } finally {
      setBusyId(null)
    }
  }

  // Cancel a chosen subset of seats. If the subset is ALL seats of the
  // booking, call the whole-booking endpoint instead (per spec).
  async function cancelSeats(booking, selectedSeatNums) {
    if (selectedSeatNums.length === 0) return
    const allSeatNums = (booking[B[8]] || []).map(seatNumOf)
    const isAll =
      selectedSeatNums.length >= allSeatNums.length &&
      allSeatNums.every((n) => selectedSeatNums.includes(n))

    setBusyId(booking[B[0]])
    try {
      if (isAll) {
        await api.cancelBooking(booking[B[2]], booking[B[0]])
      } else {
        await api.cancelSeats(booking[B[2]], selectedSeatNums)
      }
      setNotice(C.messages.bookingCancelled)
      await load()
    } catch (err) {
      setError(err.body?.message || err.message || 'Cancel failed')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <Spinner label="Loading your bookings…" />

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">My bookings</h1>

      {notice && (
        <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          {notice}
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {bookings.length === 0 ? (
        <p className="text-slate-500">You have no bookings yet.</p>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => (
            <BookingCard
              key={booking[B[0]]}
              booking={booking}
              busy={busyId === booking[B[0]]}
              onCancelWhole={() => cancelWholeBooking(booking)}
              onCancelSeats={(seatNums) => cancelSeats(booking, seatNums)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BookingCard({ booking, busy, onCancelWhole, onCancelSeats }) {
  const status = booking[B[4]]
  const cancelled = status === C.bookingStatus.cancelled
  const seats = (booking[B[8]] || []).map(seatNumOf).filter((n) => !Number.isNaN(n))
  const isSeatMap = seats.length > 0

  const [selected, setSelected] = useState(() => new Set())
  const [picking, setPicking] = useState(false)

  function toggle(n) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">Booking #{booking[B[0]]}</p>
          <p className="font-semibold">
            {booking.eventName || `Event ${booking[B[2]]}`}
          </p>
          <p className="text-sm text-slate-500">
            {booking[B[3]]} seat{booking[B[3]] === 1 ? '' : 's'}
            {booking[B[5]] != null ? ` · ${formatMoney(booking[B[5]])}` : ''}
          </p>
          {booking[B[6]] && (
            <p className="text-xs text-slate-400">Ref: {booking[B[6]]}</p>
          )}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            cancelled
              ? 'bg-slate-100 text-slate-500'
              : 'bg-green-100 text-green-700'
          }`}
        >
          {status}
        </span>
      </div>

      {isSeatMap && !cancelled && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-slate-400">Seats:</p>
          <div className="flex flex-wrap gap-2">
            {seats.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => picking && toggle(n)}
                disabled={!picking}
                className={`rounded border px-2 py-1 text-xs ${
                  selected.has(n)
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-slate-300 text-slate-600'
                } ${picking ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {n + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {!cancelled && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="btn-ghost"
            onClick={onCancelWhole}
            disabled={busy}
          >
            {busy ? 'Cancelling…' : 'Cancel whole booking'}
          </button>

          {isSeatMap && !picking && (
            <button className="btn-ghost" onClick={() => setPicking(true)}>
              Cancel specific seats
            </button>
          )}
          {isSeatMap && picking && (
            <>
              <button
                className="btn-primary"
                disabled={busy || selected.size === 0}
                onClick={() => onCancelSeats(Array.from(selected))}
              >
                Cancel {selected.size} selected
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setPicking(false)
                  setSelected(new Set())
                }}
              >
                Done
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
