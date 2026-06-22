import { createContext, useContext, useMemo, useState, useCallback } from 'react'
import api from '../api/client'
import { C } from '../contract'
import {
  getToken,
  setToken,
  clearToken,
  getUserId,
} from './auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setTok] = useState(() => getToken())

  const login = useCallback(async (credentials) => {
    const res = await api.login(credentials)
    const t = res && res[C.fields.auth.token]
    if (!t) throw new Error('Login response missing token')
    setToken(t)
    setTok(t)
    return res
  }, [])

  const register = useCallback(async (payload) => {
    const res = await api.register(payload)
    const t = res && res[C.fields.auth.token]
    if (t) {
      setToken(t)
      setTok(t)
    }
    return res
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      // even if the denylist call fails, clear locally
    }
    clearToken()
    setTok(null)
  }, [])

  const value = useMemo(
    () => ({
      token,
      isLoggedIn: !!token,
      userId: token ? getUserId() : null,
      login,
      register,
      logout,
    }),
    [token, login, register, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
