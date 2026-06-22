import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '../contract'
import useEventSocket, { SocketState } from '../ws/useEventSocket'
import Spinner from './Spinner'

// General-model booking widget: a seat-count stepper + Book button.
// Clicking Book opens a WS, sends {token} first (handled by the hook),
// waits for INIT, then sends LOCK{num_seats}. On a successful ack it sends
// DONE, closes the WS, and routes to /checkout. On failure it stays put.
export default function GeneralBooking({ event }) {
  const navigate = useNavigate()
  const F = C.wsEnvelope

  const [count, setCount] = useState(1)
  const [booking, setBooking] = useState(false) // WS session active
  const [phase, setPhase] = useState('idle') // idle | connecting | locking
  const [error, setError] = useState('')
  const [live, setLive] = useState({ avlbl: event.availableSeats, book: null })

  const initResolved = useRef(false)

  const max = Math.max(1, Number(event.availableSeats) || 1)

  const onInit = useCallback((msg) => {
    initResolved.current = true
    setLive({ avlbl: msg[F.avlbl], book: msg[F.book] })
  }, [F])

  const onDelta = useCallback((msg) => {
    // general deltas: { avlbl, book } or { avlbl_delta }
    setLive((prev) => {
      const next = { ...prev }
      if (msg[F.avlbl] !== undefined) next.avlbl = msg[F.avlbl]
      if (msg[F.book] !== undefined) next.book = msg[F.book]
      if (msg[F.avlblDelta] !== undefined)
        next.avlbl = (prev.avlbl || 0) + msg[F.avlblDelta]
      return next
    })
  }, [F])

  const { status, lockCount, finishAndClose } = useEventSocket({
    eventId: event.id,
    enabled: booking,
    onInit,
    onDelta,
  })

  // When the user clicks Book, just enable the socket; the actual LOCK is
  // fired once the socket is OPEN (and INIT has arrived) via the effect below.
  function startBooking() {
    setError('')
    setPhase('connecting')
    initResolved.current = false
    setBooking(true)
  }

  // Drive the LOCK once the socket is OPEN. A ref guards against re-firing
  // across re-renders within a single booking session.
  const lockFired = useRef(false)
  useEffect(() => {
    if (!booking) {
      lockFired.current = false
      return
    }
    if (status !== SocketState.OPEN || lockFired.current) return
    lockFired.current = true
    setPhase('locking')
    let cancelled = false
    ;(async () => {
      try {
        const ack = await lockCount(count)
        if (cancelled) return
        if (ack[F.success]) {
          await finishAndClose()
          setBooking(false)
          navigate('/checkout', {
            state: { model: C.eventModel.general, event, numSeats: count },
          })
        } else {
          // Insufficient availability: show error, stay, leave no WS side
          // effects (the failed LOCK held nothing). Just close.
          setError(C.messages.insufficientSeats)
          await finishAndClose()
          setBooking(false)
          setPhase('idle')
        }
      } catch (err) {
        if (cancelled) return
        setError(err.message || C.messages.wsClosed)
        setBooking(false)
        setPhase('idle')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [booking, status, count, lockCount, finishAndClose, navigate, event, F])

  const processing = booking && (phase === 'connecting' || phase === 'locking')
  const avlbl = live.avlbl ?? event.availableSeats

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <label className="label">Number of seats</label>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          className="btn-ghost h-10 w-10 p-0 text-lg"
          onClick={() => setCount((c) => Math.max(1, c - 1))}
          disabled={processing || count <= 1}
        >
          −
        </button>
        <span className="w-10 text-center text-lg font-semibold">{count}</span>
        <button
          type="button"
          className="btn-ghost h-10 w-10 p-0 text-lg"
          onClick={() => setCount((c) => Math.min(max, c + 1))}
          disabled={processing || count >= max}
        >
          +
        </button>
        <span className="ml-2 text-xs text-slate-400">
          {avlbl != null ? `${avlbl} available` : ''}
        </span>
      </div>

      <button
        className="btn-primary w-full"
        onClick={startBooking}
        disabled={processing || max < 1}
      >
        {processing ? 'Processing…' : 'Book'}
      </button>

      {processing && (
        <div className="mt-3">
          <Spinner
            label={
              phase === 'connecting' ? 'Connecting…' : 'Holding your seats…'
            }
          />
        </div>
      )}
    </div>
  )
}
