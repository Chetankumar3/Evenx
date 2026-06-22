import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { C } from '../contract'

// Field list is driven by the contract: name,email,username,mobile,location,
// address,password.
const FIELD_META = {
  name: { label: 'Full name', type: 'text', autoComplete: 'name' },
  email: { label: 'Email', type: 'email', autoComplete: 'email' },
  username: { label: 'Username', type: 'text', autoComplete: 'username' },
  mobile: { label: 'Mobile', type: 'tel', autoComplete: 'tel' },
  location: { label: 'City / Location', type: 'text', autoComplete: 'address-level2' },
  address: { label: 'Address', type: 'text', autoComplete: 'street-address' },
  password: { label: 'Password', type: 'password', autoComplete: 'new-password' },
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const fields = C.fields.auth.register

  const [form, setForm] = useState(() =>
    Object.fromEntries(fields.map((f) => [f, '']))
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await register(form)
      // If the backend returns a token, we're logged in -> home.
      // Otherwise send the user to login.
      if (res && res[C.fields.auth.token]) navigate('/', { replace: true })
      else navigate('/login', { replace: true })
    } catch (err) {
      setError(err.body?.message || err.message || 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-bold">Create your account</h1>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        {fields.map((field) => {
          const meta = FIELD_META[field] || { label: field, type: 'text' }
          return (
            <div key={field}>
              <label className="label">{meta.label}</label>
              <input
                className="input"
                type={meta.type}
                autoComplete={meta.autoComplete}
                value={form[field]}
                onChange={(e) => update(field, e.target.value)}
                required
              />
            </div>
          )
        })}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="text-brand-600 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}
