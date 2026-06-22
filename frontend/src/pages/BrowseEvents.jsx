import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import { C } from '../contract'
import EventCard from '../components/EventCard'
import Spinner from '../components/Spinner'

export default function BrowseEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Client-side filter controls; `location` is also passed to the API.
  const [location, setLocation] = useState('')
  const [appliedLocation, setAppliedLocation] = useState('')
  const [model, setModel] = useState('all')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const query = appliedLocation
          ? { [C.searchParams.location]: appliedLocation }
          : undefined
        const data = await api.listEvents(query)
        if (!alive) return
        setEvents(Array.isArray(data) ? data : data?.events || [])
      } catch (err) {
        if (alive) setError(err.message || 'Failed to load events')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [appliedLocation])

  const filtered = useMemo(() => {
    if (model === 'all') return events
    return events.filter((e) => e.model === model)
  }, [events, model])

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Browse all events</h1>

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <label className="label">Location</label>
          <input
            className="input"
            value={location}
            placeholder="Any city"
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setAppliedLocation(location.trim())
            }}
          />
        </div>
        <div>
          <label className="label">Model</label>
          <select
            className="input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="all">All</option>
            <option value={C.eventModel.general}>General</option>
            <option value={C.eventModel.seatMap}>Seat map</option>
          </select>
        </div>
        <button
          className="btn-primary"
          onClick={() => setAppliedLocation(location.trim())}
        >
          Apply
        </button>
        {appliedLocation && (
          <button
            className="btn-ghost"
            onClick={() => {
              setLocation('')
              setAppliedLocation('')
            }}
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <Spinner label="Loading…" />
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500">No events match your filters.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
