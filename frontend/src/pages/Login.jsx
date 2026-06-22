import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { C } from '../contract'

// Login accepts username OR email + password (contract.fields.auth.login).
export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from?.pathname || '/'

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(location.state?.message || '')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      // Send identifier under both username & email keys; backend picks
      // whichever matches. Field names come from the contract.
      const [uKey, eKey] = C.fields.auth.login
      const isEmail = identifier.includes('@')
      const payload = {
        [isEmail ? eKey : uKey]: identifier,
        password,
      }
      await login(payload)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.body?.message || err.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">Log in</h1>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="label">Username or email</label>
          <input
            className="input"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoComplete="username"
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-500">
        No account?{' '}
        <Link to="/register" className="text-brand-600 hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  )
}
