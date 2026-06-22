import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import api from '../api/client'
import { C } from '../contract'
import useEventSocket, { SocketState } from '../ws/useEventSocket'
import { decodeBitmap } from '../ws/bitmap'
import SeatGrid, { deriveUiState } from '../components/SeatGrid'
import Legend from '../components/Legend'
import Spinner from '../components/Spinner'

export default function SeatMapPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const routerLoc = useLocation()
  const F = C.wsEnvelope

  const [event, setEvent] = useState(routerLoc.state?.event || null)
  const [wireStatuses, setWireStatuses] = useState(null) // int[] per seat
  const [mine, setMine] = useState(() => new Set()) // seat indices I locked
  const [processing, setProcessing] = useState(() => new Set()) // awaiting ack
  const [error, setError] = useState('')
  const [proceeding, setProceeding] = useState(false)

  // Load event detail if we didn't arrive with it (e.g. direct nav / refresh).
  useEffect(() => {
    if (event) return
    let alive = true
    ;(async () => {
      try {
        const data = await api.eventDetails(id)
        if (alive) setEvent(data)
      } catch (err) {
        if (alive) setError(err.message || 'Failed to load event')
      }
    })()
    return () => {
      alive = false
    }
  }, [id, event])

  const onInit = useCallback(
    (msg) => {
      const total = event?.totalSeats
      const decoded = decodeBitmap(msg[F.bitmap], total)
      setWireStatuses(decoded)
    },
    [F, event]
  )

  // Live pubsub delta: { seat_num, new_status }
  const onDelta = useCallback(
    (msg) => {
      if (msg[F.seatNum] === undefined || msg[F.newStatus] === undefined) return
      const seat = Number(msg[F.seatNum])
      const newStatus = Number(msg[F.newStatus])
      setWireStatuses((prev) => {
        if (!prev) return prev
        const next = prev.slice()
        next[seat] = newStatus
        return next
      })
      // If a seat I thought was mine got released/booked by the world,
      // reconcile my set: only keep it mine if it's still LOCKED.
      setMine((prev) => {
        if (!prev.has(seat)) return prev
        if (newStatus === C.seatStatus.LOCKED) return prev
        const next = new Set(prev)
        next.delete(seat)
        return next
      })
    },
    [F]
  )

  const { status, lockSeats, finishAndClose } = useEventSocket({
    eventId: event?.id,
    enabled: !!event,
    onInit,
    onDelta,
  })

  const handleSeatClick = useCallback(
    async (seatIndex) => {
      // optimistic: show Processing immediately
      setProcessing((prev) => new Set(prev).add(seatIndex))
      try {
        const ack = await lockSeats([seatIndex])
        const failed = ack[F.failedSeats] || []
        setProcessing((prev) => {
          const next = new Set(prev)
          next.delete(seatIndex)
          return next
        })
        if (ack[F.success] && !failed.includes(seatIndex)) {
          // mark mine + reflect locked in wire state
          setMine((prev) => new Set(prev).add(seatIndex))
          setWireStatuses((prev) => {
            if (!prev) return prev
            const next = prev.slice()
            next[seatIndex] = C.seatStatus.LOCKED
            return next
          })
        } else {
          setError(C.messages.lockFailedSeats)
        }
      } catch (err) {
        setProcessing((prev) => {
          const next = new Set(prev)
          next.delete(seatIndex)
          return next
        })
        setError(err.message || C.messages.wsClosed)
      }
    },
    [lockSeats, F]
  )

  // Proceed to checkout: requires >=1 of my green seats. Send DONE, close, route.
  async function proceed() {
    if (mine.size === 0) return
    setProceeding(true)
    const seatNums = Array.from(mine).sort((a, b) => a - b)
    try {
      await finishAndClose()
    } catch {
      /* ignore */
    }
    navigate('/checkout', {
      state: {
        model: C.eventModel.seatMap,
        event,
        seatNums,
      },
    })
  }

  const seats = useMemo(() => {
    if (!wireStatuses) return []
    return wireStatuses.map((wire, index) => ({
      index,
      ui: deriveUiState(wire, mine.has(index), processing.has(index)),
    }))
  }, [wireStatuses, mine, processing])

  if (error && !event) return <p className="text-red-600">{error}</p>
  if (!event) return <Spinner label="Loading event…" />

  const connecting =
    status === SocketState.CONNECTING || (!wireStatuses && status === SocketState.OPEN)

  // Choose a column count that keeps the grid reasonable.
  const columns = Math.min(16, Math.max(8, Math.round(Math.sqrt((event.totalSeats || 60) * 1.6))))

  return (
    <div>
      <button
        onClick={() => navigate(`/event/${event.id}`)}
        className="mb-4 text-sm text-brand-600 hover:underline"
      >
        ← Back to event
      </button>

      <h1 className="text-2xl font-bold">{event.name}</h1>
      <p className="mb-4 text-slate-500">Select your seats</p>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mb-4">
        <Legend />
      </div>

      <div className="mb-4 rounded-md bg-slate-800 py-1 text-center text-xs font-medium uppercase tracking-widest text-slate-200">
        Screen / Stage
      </div>

      {connecting ? (
        <Spinner label="Loading seat map…" />
      ) : status === SocketState.CLOSED && !wireStatuses ? (
        <p className="text-red-600">{C.messages.wsClosed}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
          <SeatGrid seats={seats} columns={columns} onSeatClick={handleSeatClick} />
        </div>
      )}

      <div className="sticky bottom-0 mt-6 flex items-center justify-between border-t border-slate-200 bg-white/90 py-4 backdrop-blur">
        <p className="text-sm text-slate-600">
          {mine.size} seat{mine.size === 1 ? '' : 's'} selected
        </p>
        <button
          className="btn-primary"
          onClick={proceed}
          disabled={mine.size === 0 || proceeding}
        >
          {proceeding ? 'Proceeding…' : 'Proceed to Checkout'}
        </button>
      </div>
    </div>
  )
}
