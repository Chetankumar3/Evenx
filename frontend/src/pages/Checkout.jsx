import { useState } from 'react'
import { useLocation, useNavigate, Navigate } from 'react-router-dom'
import api, { ApiError } from '../api/client'
import { C } from '../contract'
import { formatDateTime, formatMoney } from '../lib/format'

// Fake checkout. Single "Pay" -> ONE call to POST /events/:eventid/checkout.
//  body (seat_map): { seat_nums: [...] }
//  body (general):  { num_seats: N }
// Success -> Confirmation. 409 (lock expired) -> back to event w/ sessionExpired.
export default function Checkout() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Guard: must arrive from a booking flow.
  if (!state || !state.event || !state.model) {
    return <Navigate to="/" replace />
  }

  const { event, model, seatNums, numSeats } = state
  const isSeatMap = model === C.eventModel.seatMap
  const seatCount = isSeatMap ? (seatNums?.length || 0) : numSeats

  // Amount: prefer a unit price field if present, else just show seat count.
  const unitPrice = event.price ?? event.amount ?? null
  const amount = unitPrice != null ? Number(unitPrice) * seatCount : null

  async function pay() {
    setBusy(true)
    setError('')
    try {
      // Body keyed by the contract's per-model checkout field name.
      const body = isSeatMap
        ? { [C.fields.checkoutBody.seat_map]: seatNums }
        : { [C.fields.checkoutBody.general]: numSeats }

      const booking = await api.checkout(event.id, body)
      navigate('/confirmation', {
        replace: true,
        state: { booking, event, model, seatNums, numSeats },
      })
    } catch (err) {
      // 409 -> lock expired / session invalidated.
      if (err instanceof ApiError && err.status === 409) {
        navigate(`/event/${event.id}`, {
          replace: true,
          state: { notice: C.messages.sessionExpired },
        })
        return
      }
      setError(err.body?.message || err.message || 'Payment failed')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Checkout</h1>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">{event.name}</h2>
        <p className="text-sm text-slate-500">{formatDateTime(event.dateTime)}</p>

        <dl className="mt-4 space-y-2 text-sm">
          {isSeatMap ? (
            <div className="flex justify-between">
              <dt className="text-slate-500">Seats</dt>
              <dd className="font-medium">
                {seatNums.map((n) => n + 1).join(', ')}
              </dd>
            </div>
          ) : (
            <div className="flex justify-between">
              <dt className="text-slate-500">Tickets</dt>
              <dd className="font-medium">{numSeats}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-100 pt-2">
            <dt className="text-slate-500">Amount</dt>
            <dd className="font-semibold">
              {amount != null ? formatMoney(amount) : `${seatCount} ticket(s)`}
            </dd>
          </div>
        </dl>

        <button
          className="btn-primary mt-6 w-full"
          onClick={pay}
          disabled={busy}
        >
          {busy ? 'Processing payment…' : 'Pay'}
        </button>
        <p className="mt-2 text-center text-xs text-slate-400">
          This is a demo gateway — no real charge is made.
        </p>
      </div>
    </div>
  )
}
