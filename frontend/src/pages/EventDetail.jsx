import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import api from '../api/client'
import { C } from '../contract'
import { useAuth } from '../auth/AuthContext'
import Spinner from '../components/Spinner'
import GeneralBooking from '../components/GeneralBooking'
import { formatDateTime, joinArtists } from '../lib/format'

export default function EventDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isLoggedIn } = useAuth()

  const [event, setEvent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // A message routed back from a failed checkout (lock expired).
  const [notice, setNotice] = useState(location.state?.notice || '')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const data = await api.eventDetails(id)
        if (alive) setEvent(data)
      } catch (err) {
        if (alive) setError(err.message || 'Failed to load event')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [id])

  if (loading) return <Spinner label="Loading event…" />
  if (error) return <p className="text-red-600">{error}</p>
  if (!event) return null

  const isSeatMap = event.model === C.eventModel.seatMap

  function requireLogin(next) {
    if (isLoggedIn) return true
    navigate('/login', {
      state: { from: { pathname: next }, message: C.messages.loginRequired },
    })
    return false
  }

  return (
    <div>
      {notice && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {notice}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl bg-slate-200">
        {event.bannerurl ? (
          <img
            src={event.bannerurl}
            alt={event.name}
            className="h-64 w-full object-cover"
          />
        ) : (
          <div className="flex h-64 items-center justify-center text-slate-400">
            No banner
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h1 className="text-3xl font-bold">{event.name}</h1>
          <p className="mt-1 text-slate-500">{formatDateTime(event.dateTime)}</p>
          {(event.venue || event.location) && (
            <p className="text-slate-500">
              {[event.venue, event.location].filter(Boolean).join(' · ')}
            </p>
          )}
          {event.artists && (
            <p className="mt-2 text-brand-600">{joinArtists(event.artists)}</p>
          )}
          {event.description && (
            <p className="mt-4 whitespace-pre-line text-slate-700">
              {event.description}
            </p>
          )}
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-400">Total seats</dt>
              <dd className="font-medium">{event.totalSeats ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Available</dt>
              <dd className="font-medium">{event.availableSeats ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Model</dt>
              <dd className="font-medium capitalize">{event.model}</dd>
            </div>
          </dl>
        </div>

        <aside className="lg:col-span-1">
          <div className="sticky top-24 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Book tickets</h2>

            {isSeatMap ? (
              <>
                <p className="mb-4 text-sm text-slate-500">
                  Pick your exact seats in the live seat map.
                </p>
                <button
                  className="btn-primary w-full"
                  onClick={() => {
                    const next = `/event/${event.id}/seatmap`
                    if (requireLogin(next))
                      navigate(next, { state: { event } })
                  }}
                >
                  Open Seat Map
                </button>
              </>
            ) : (
              <GeneralBooking event={event} requireLogin={requireLogin} />
            )}

            {!isLoggedIn && (
              <p className="mt-3 text-xs text-slate-400">
                <Link to="/login" className="text-brand-600 hover:underline">
                  Log in
                </Link>{' '}
                to book.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
