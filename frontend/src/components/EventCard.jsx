import { Link } from 'react-router-dom'
import { formatDateTime, joinArtists } from '../lib/format'

// Reads only the event field names declared in the contract
// (id, name, thumbnailurl, dateTime, venue, location, artists, model).
export default function EventCard({ event }) {
  return (
    <Link to={`/event/${event.id}`} className="card flex flex-col">
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
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="line-clamp-1 font-semibold">{event.name}</h3>
        <p className="text-sm text-slate-500">{formatDateTime(event.dateTime)}</p>
        {(event.venue || event.location) && (
          <p className="line-clamp-1 text-xs text-slate-400">
            {[event.venue, event.location].filter(Boolean).join(' · ')}
          </p>
        )}
        {event.artists && (
          <p className="line-clamp-1 text-xs text-brand-600">
            {joinArtists(event.artists)}
          </p>
        )}
      </div>
    </Link>
  )
}
