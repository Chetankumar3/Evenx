// Reusable fetch wrapper.
//  - resolves endpoint templates via the contract
//  - injects the Authorization: Bearer <token> header on non-public requests
//  - throws ApiError (carries HTTP status + parsed body) on non-2xx
import { C, resolvePath, apiBaseUrl } from '../contract'
import { getToken } from '../auth/auth'

export class ApiError extends Error {
  constructor(status, body, message) {
    super(message || (body && body.message) || `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

// Build a query string from a {contractParamName: value} map, skipping
// undefined / null / '' values.
export function buildQuery(params = {}) {
  const usp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') usp.append(k, v)
  })
  const s = usp.toString()
  return s ? `?${s}` : ''
}

async function parseBody(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Low-level request.
 * @param {{method,path}} endpoint  one of C.endpoints
 * @param {object} opts
 *   params  - path template params (:id, :eventid, ...)
 *   query   - query-string object (already keyed by contract param names)
 *   body    - JSON body
 *   auth    - default true; set false for the three public GET routes
 */
export async function request(endpoint, opts = {}) {
  const { params = {}, query, body, auth = true, signal } = opts
  const path = resolvePath(endpoint.path, params)
  const url = apiBaseUrl() + path + (query ? buildQuery(query) : '')

  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  if (auth) {
    const token = getToken()
    if (token) headers[C.authHeader] = `${C.authScheme} ${token}`
  }

  const res = await fetch(url, {
    method: endpoint.method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })

  const parsed = await parseBody(res)
  if (!res.ok) throw new ApiError(res.status, parsed)
  return parsed
}

// --- Typed endpoint helpers (all field names come from the contract) ---
const E = C.endpoints

export const api = {
  // Auth (public)
  register: (payload) => request(E.register, { body: payload, auth: false }),
  login: (payload) => request(E.login, { body: payload, auth: false }),
  logout: () => request(E.logout),

  // Events (public)
  listEvents: (query) => request(E.events, { query, auth: false }),
  eventDetails: (id) => request(E.eventDetails, { params: { id }, auth: false }),
  search: (query) => request(E.search, { query, auth: false }),

  // Bookings (auth)
  checkout: (eventid, body) =>
    request(E.checkout, { params: { eventid }, body }),
  cancelBooking: (eventid, bookingid) =>
    request(E.cancelBooking, { params: { eventid, bookingid } }),
  cancelSeats: (eventid, seatNums) =>
    request(E.cancelSeats, {
      params: { eventid },
      body: { [C.fields.cancelSeatsBody]: seatNums },
    }),
  myBookings: (userid) => request(E.myBookings, { params: { userid } }),
}

export default api
