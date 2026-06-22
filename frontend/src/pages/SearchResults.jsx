import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { C } from '../contract'
import EventCard from '../components/EventCard'
import Spinner from '../components/Spinner'

// Backend-driven search. Reads query params keyed by contract.searchParams
// directly off the URL and forwards them to GET /search.
export default function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams()
  const SP = C.searchParams

  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Advanced filter inputs (optional) backed by the URL.
  const get = (key) => searchParams.get(key) || ''

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        // Pass through every recognized search param present in the URL.
        const query = {}
        Object.values(SP).forEach((key) => {
          const v = searchParams.get(key)
          if (v) query[key] = v
        })
        const data = await api.search(query)
        if (!alive) return
        setResults(Array.isArray(data) ? data : data?.events || [])
      } catch (err) {
        if (alive) setError(err.message || 'Search failed')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()])

  function setParam(key, value) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const query = get(SP.query)

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">
        {query ? `Results for “${query}”` : 'Search'}
      </h1>

      <div className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <label className="label">Location</label>
          <input
            className="input"
            defaultValue={get(SP.location)}
            onBlur={(e) => setParam(SP.location, e.target.value.trim())}
          />
        </div>
        <div>
          <label className="label">Code</label>
          <input
            className="input"
            defaultValue={get(SP.code)}
            onBlur={(e) => setParam(SP.code, e.target.value.trim())}
          />
        </div>
        <div>
          <label className="label">From</label>
          <input
            type="date"
            className="input"
            defaultValue={get(SP.dateFrom)}
            onChange={(e) => setParam(SP.dateFrom, e.target.value)}
          />
        </div>
        <div>
          <label className="label">To</label>
          <input
            type="date"
            className="input"
            defaultValue={get(SP.dateTo)}
            onChange={(e) => setParam(SP.dateTo, e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={get(SP.hasArtist) === 'true'}
            onChange={(e) =>
              setParam(SP.hasArtist, e.target.checked ? 'true' : '')
            }
          />
          Has artist
        </label>
      </div>

      {loading ? (
        <Spinner label="Searching…" />
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : results.length === 0 ? (
        <p className="text-slate-500">No results.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
