import { C } from '../contract'

// Visual seat states (UI-only; distinct from the wire seatStatus integers).
export const UISeat = {
  EMPTY: 'empty',
  PROCESSING: 'processing', // LOCK requested by me, awaiting ack
  MINE: 'mine', // green: locked by me this session
  LOCKED_OTHER: 'locked_other', // grey + lock icon
  BOOKED: 'booked',
}

function seatClasses(ui) {
  switch (ui) {
    case UISeat.PROCESSING:
      return 'seat-processing text-white cursor-wait'
    case UISeat.MINE:
      return 'bg-green-500 text-white hover:bg-green-600'
    case UISeat.LOCKED_OTHER:
      return 'bg-slate-400 text-white cursor-not-allowed'
    case UISeat.BOOKED:
      return 'bg-slate-700 text-white cursor-not-allowed'
    case UISeat.EMPTY:
    default:
      return 'bg-slate-200 text-slate-600 hover:bg-brand-100'
  }
}

// Map the wire seatStatus integer + my-session knowledge to a UI state.
export function deriveUiState(wireStatus, mine, processing) {
  if (processing) return UISeat.PROCESSING
  if (wireStatus === C.seatStatus.BOOKED) return UISeat.BOOKED
  if (wireStatus === C.seatStatus.LOCKED)
    return mine ? UISeat.MINE : UISeat.LOCKED_OTHER
  return UISeat.EMPTY
}

export default function SeatGrid({ seats, columns = 12, onSeatClick }) {
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {seats.map((s) => {
        const clickable = s.ui === UISeat.EMPTY
        return (
          <button
            key={s.index}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onSeatClick(s.index)}
            title={`Seat ${s.index + 1}`}
            className={`relative flex h-8 items-center justify-center rounded text-[10px] font-medium transition ${seatClasses(
              s.ui
            )}`}
          >
            {s.ui === UISeat.LOCKED_OTHER ? (
              <LockIcon />
            ) : (
              s.index + 1
            )}
          </button>
        )
      })}
    </div>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
      <path d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm3 8H9V6a3 3 0 016 0v3z" />
    </svg>
  )
}
