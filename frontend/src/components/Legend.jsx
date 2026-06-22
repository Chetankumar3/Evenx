// Seat-map legend. Mirrors the SeatGrid color scheme exactly.
const items = [
  { label: 'Empty', cls: 'bg-slate-200' },
  { label: 'Processing', cls: 'seat-processing' },
  { label: 'Reserved by me', cls: 'bg-green-500' },
  { label: 'Locked by other', cls: 'bg-slate-400' },
  { label: 'Booked', cls: 'bg-slate-700' },
]

export default function Legend() {
  return (
    <div className="flex flex-wrap gap-4">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-xs text-slate-600">
          <span className={`inline-block h-4 w-4 rounded ${it.cls}`} />
          {it.label}
        </div>
      ))}
    </div>
  )
}
