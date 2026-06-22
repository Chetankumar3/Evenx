import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { C } from '../contract'

// Guards routes that require a logged-in user. Redirects to /login,
// preserving the intended destination and surfacing the contract message.
export default function ProtectedRoute({ children }) {
  const { isLoggedIn } = useAuth()
  const location = useLocation()

  if (!isLoggedIn) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location, message: C.messages.loginRequired }}
      />
    )
  }
  return children
}
