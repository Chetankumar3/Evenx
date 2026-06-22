// Small shared formatting helpers. All event field reads go through the
// contract's field list indirectly via the components, but these are pure
// display utilities.

export function formatDateTime(value) {
  if (!value) return 'TBA'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDate(value) {
  if (!value) return 'TBA'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatMoney(amount) {
  if (amount === undefined || amount === null) return '—'
  const n = Number(amount)
  if (Number.isNaN(n)) return String(amount)
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

export function joinArtists(artists) {
  if (!artists) return ''
  if (Array.isArray(artists)) return artists.join(', ')
  return String(artists)
}
