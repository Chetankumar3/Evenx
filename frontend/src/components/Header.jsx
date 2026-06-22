import { Link, NavLink } from 'react-router-dom'
import SearchBar from './SearchBar'
import { useAuth } from '../auth/AuthContext'

function navClass({ isActive }) {
  return `text-sm font-medium ${
    isActive ? 'text-brand-700' : 'text-slate-600 hover:text-slate-900'
  }`
}

export default function Header() {
  const { isLoggedIn, logout } = useAuth()

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <Link to="/" className="text-xl font-bold tracking-tight text-brand-700">
          Even<span className="text-slate-900">X</span>
        </Link>

        <div className="order-3 w-full md:order-2 md:w-auto md:flex-1">
          <SearchBar />
        </div>

        <nav className="order-2 ml-auto flex items-center gap-4 md:order-3">
          <NavLink to="/events" className={navClass}>
            Browse
          </NavLink>
          {isLoggedIn ? (
            <>
              <NavLink to="/bookings" className={navClass}>
                My Bookings
              </NavLink>
              <button onClick={logout} className="btn-ghost py-1.5">
                Logout
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={navClass}>
                Login
              </NavLink>
              <Link to="/register" className="btn-primary py-1.5">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
