import { Link } from 'react-router-dom'
import { formatDateTime } from '../lib/format'

// A horizontally-scrolling row of event tiles.
// Tile = thumbnail (thumbnailurl), event name, date & time.
export default function EventSlider({ title, events }) {
  if (!events || events.length === 0) return null
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {events.map((event) => (
          <Link
            key={event.id}
            to={`/event/${event.id}`}
            className="card w-60 flex-shrink-0"
          >
            <div className="aspect-video w-full overflow-hidden bg-slate-100">
              {event.thumbnailurl ? (
                <img
                  src={event.thumbnailurl}
                  alt={event.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  No image
                </div>
              )}
            </div>
            <div className="p-3">
              <h3 className="line-clamp-1 text-sm font-semibold">{event.name}</h3>
              <p className="text-xs text-slate-500">
                {formatDateTime(event.dateTime)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
