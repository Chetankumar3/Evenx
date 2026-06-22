// Contract helper: the ONLY place that imports contract.json.
// Every wire-format name (endpoint paths, field names, WS actions, status
// enums, seat-status integers, user-facing messages) flows through here so
// renaming anything on the wire is a one-file change.
import contract from './contract.json'

export const C = {
  raw: contract,

  // --- HTTP API ---
  api: contract.api,
  endpoints: contract.api.endpoints,
  authHeader: contract.api.authHeader,
  authScheme: contract.api.authScheme,
  baseUrlEnv: contract.api.baseUrlEnv,
  wsUrlEnv: contract.api.wsUrlEnv,
  wsStreamPath: contract.api.wsStreamPath,

  // --- request/response field names ---
  fields: contract.fields,
  searchParams: contract.searchParams,

  // --- WebSocket protocol ---
  ws: contract.ws,
  wsEnvelope: contract.ws.envelopeFields,
  clientActions: contract.ws.clientActions,
  serverTypes: contract.ws.serverTypes,

  // --- enums & status ---
  enums: contract.enums,
  eventModel: contract.enums.eventModel,
  bookingStatus: contract.enums.bookingStatus,
  seatStatus: contract.seatStatus,

  // --- user-facing strings ---
  messages: contract.messages,
}

// Resolve a path template like "/events/:eventid/cancel/:bookingid"
// by replacing ":name" segments with values from `params`.
export function resolvePath(template, params = {}) {
  return template.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (match, key) => {
    if (params[key] === undefined || params[key] === null) {
      throw new Error(`resolvePath: missing param "${key}" for "${template}"`)
    }
    return encodeURIComponent(params[key])
  })
}

// Convenience: read the env-driven base URLs by the env var NAMES the
// contract declares (kept indirect so the contract owns the var names too).
export function apiBaseUrl() {
  return import.meta.env[C.baseUrlEnv] || 'http://localhost:3000'
}

export function wsBaseUrl() {
  return import.meta.env[C.wsUrlEnv] || 'ws://localhost:8080'
}

export default C
