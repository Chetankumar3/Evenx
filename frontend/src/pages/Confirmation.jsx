import { Link, useLocation, Navigate } from 'react-router-dom'
import { C } from '../contract'
import { formatDateTime, formatMoney } from '../lib/format'

export default function Confirmation() {
  const { state } = useLocation()
  if (!state || !state.booking) return <Navigate to="/" replace />

  const { booking, event } = state
  // Read booking fields by the contract's declared names.
  const B = C.fields.booking // ["id","userId","eventId","numSeats","status","amount","paymentRef","createdAt","seats"]

  return (
    <div className="mx-auto max-w-lg text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <svg viewBox="0 0 24 24" className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold">{C.messages.bookingConfirmed}</h1>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm">
        {event && (
          <>
            <h2 className="text-lg font-semibold">{event.name}</h2>
            <p className="text-sm text-slate-500">
              {formatDateTime(event.dateTime)}
            </p>
          </>
        )}
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Booking ID" value={booking[B[0]]} />
          <Row label="Seats" value={booking[B[3]]} />
          <Row label="Status" value={booking[B[4]]} />
          {booking[B[5]] != null && (
            <Row label="Amount" value={formatMoney(booking[B[5]])} />
          )}
          {booking[B[6]] && <Row label="Payment ref" value={booking[B[6]]} />}
          {Array.isArray(booking[B[8]]) && booking[B[8]].length > 0 && (
            <Row
              label="Seat numbers"
              value={booking[B[8]]
                .map((s) => (typeof s === 'object' ? s.seatNum ?? s : s))
                .map((n) => Number(n) + 1)
                .join(', ')}
            />
          )}
        </dl>
      </div>

      <div className="mt-6 flex justify-center gap-3">
        <Link to="/bookings" className="btn-primary">
          View my bookings
        </Link>
        <Link to="/" className="btn-ghost">
          Back home
        </Link>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{String(value)}</dd>
    </div>
  )
}
