import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { C } from '../contract'

// Header search bar. Backend-driven via /search; 300ms debounce.
// Navigates to /search?<contract.searchParams.query>=<text>.
export default function SearchBar() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qKey = C.searchParams.query
  const [text, setText] = useState(searchParams.get(qKey) || '')
  const timer = useRef(null)
  const first = useRef(true)

  useEffect(() => {
    // Don't auto-navigate on the very first render.
    if (first.current) {
      first.current = false
      return
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const trimmed = text.trim()
      if (trimmed) {
        navigate(`/search?${qKey}=${encodeURIComponent(trimmed)}`)
      }
    }, 300)
    return () => timer.current && clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  function onSubmit(e) {
    e.preventDefault()
    if (timer.current) clearTimeout(timer.current)
    const trimmed = text.trim()
    if (trimmed) navigate(`/search?${qKey}=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md">
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search events, artists, venues…"
        className="input"
        aria-label="Search events"
      />
    </form>
  )
}
