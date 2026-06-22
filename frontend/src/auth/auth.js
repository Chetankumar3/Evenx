// Auth token storage + JWT decoding (no external library needed).
import { C } from '../contract'

const TOKEN_KEY = 'evenx.token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function isLoggedIn() {
  return !!getToken()
}

// base64url -> JSON. Decodes the middle (payload) segment of a JWT.
function base64UrlDecode(segment) {
  let s = segment.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const decoded = atob(s)
  // handle UTF-8 safely
  try {
    return decodeURIComponent(
      decoded
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
  } catch {
    return decoded
  }
}

export function decodeJwt(token) {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    return JSON.parse(base64UrlDecode(parts[1]))
  } catch {
    return null
  }
}

// JWT subject = userId (claims.sub per the master spec).
export function getUserId() {
  const claims = decodeJwt(getToken())
  return claims ? claims.sub : null
}

// The contract owns the token field name used in request/response bodies.
export const TOKEN_FIELD = C.fields.auth.token
