import { useEffect, useState } from 'react'
import api from '../api/client'
import { C } from '../contract'
import EventSlider from '../components/EventSlider'
import Spinner from '../components/Spinner'

// Best-effort reverse-geocode a city name from coordinates is out of scope;
// geolocation is OPTIONAL and must never block rendering. We attempt to pass
// a `location` query if we can derive one cheaply, otherwise fetch all events.
function tryGeolocation() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    const done = (val) => resolve(val)
    const timer = setTimeout(() => done(null), 2000)
    navigator.geolocation.getCurrentPosition(
      () => {
        clearTimeout(timer)
        // We have a fix but no city without a geocoder; resolve null so we
        // simply fetch the full list. (Hook left here for future enrichment.)
        done(null)
      },
      () => {
        clearTimeout(timer)
        done(null)
      },
      { timeout: 2000, maximumAge: 600000 }
    )
  })
}

export default function Home() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const city = await tryGeolocation()
        const query = city ? { [C.searchParams.location]: city } : undefined
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
  }, [])

  if (loading) {
    return (
      <div className="py-16">
        <Spinner label="Loading events…" />
      </div>
    )
  }

  if (error) {
    return <p className="py-8 text-red-600">{error}</p>
  }

  // "Trending" = first slice, "Happening Soon" = soonest by dateTime.
  const trending = events.slice(0, 12)
  const happeningSoon = [...events]
    .filter((e) => e.dateTime)
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
    .slice(0, 12)

  return (
    <div>
      <div className="mb-8 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 p-8 text-white">
        <h1 className="text-3xl font-bold">Find your next experience</h1>
        <p className="mt-2 text-brand-50">
          Concerts, shows and events — book in seconds.
        </p>
      </div>

      {events.length === 0 ? (
        <p className="text-slate-500">No events available right now.</p>
      ) : (
        <>
          <EventSlider title="Trending" events={trending} />
          <EventSlider title="Happening Soon" events={happeningSoon} />
        </>
      )}
    </div>
  )
}
