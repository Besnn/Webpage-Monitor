import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const AuthContext = createContext()

// Default session duration: 24 hours (in milliseconds)
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    // During HMR module invalidation the context may briefly be undefined.
    // Return a safe no-op fallback so consumers don't crash.
    return {
      currentUser: null,
      isAuthenticated: false,
      isAdmin: false,
      loading: true,
      login: async () => {},
      logout: () => {},
      refreshUser: async () => {},
      isSessionExpired: () => false,
      handleExpiredSession: () => {},
    }
  }
  return ctx
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  // Keep a ref so the fetch interceptor always calls the latest version
  const handleExpiredSessionRef = useRef(null)

  const clearSession = () => {
    setCurrentUser(null)
    localStorage.removeItem('user')
    localStorage.removeItem('sessionExpiresAt')
  }

  const isSessionExpired = () => {
    const expiresAt = localStorage.getItem('sessionExpiresAt')
    if (!expiresAt) return true
    return Date.now() > parseInt(expiresAt, 10)
  }

  const handleExpiredSession = () => {
    clearSession()
    navigate('/login', { state: { message: 'Your session has expired. Please log in again.' } })
  }

  // Keep ref in sync
  handleExpiredSessionRef.current = handleExpiredSession

  // Check if user is already logged in (from localStorage)
  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      if (isSessionExpired()) {
        // Session expired — clear it silently on load
        clearSession()
      } else {
        try {
          setCurrentUser(JSON.parse(storedUser))
        } catch (error) {
          console.error('Error parsing stored user:', error)
          clearSession()
        }
      }
    }
    setLoading(false)
  }, [])

  // Intercept all fetch calls to detect 401 (expired/invalid session) responses
  useEffect(() => {
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      const response = await originalFetch(...args)
      if (response.status === 401) {
        const storedUser = localStorage.getItem('user')
        // Don't treat a 401 on the login endpoint as an expired session —
        // that would just be wrong credentials entered by the user.
        const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url ?? ''
        const isLoginEndpoint = requestUrl.includes('/api/auth/login')
        if (storedUser && !isLoginEndpoint) {
          handleExpiredSessionRef.current?.()
        }
      }
      return response
    }
    return () => {
      window.fetch = originalFetch
    }
  }, [])

  // Login function
  const login = async (username, password) => {
    try {
      const baseUrl = import.meta.env.DEV
        ? (import.meta.env.VITE_DEVELOPMENT_SERVER_URL || '')
        : (import.meta.env.VITE_PRODUCTION_SERVER_URL || '')
      const response = await fetch(baseUrl + '/api/auth/login/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username, password }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        // Use the error message from Django if available
        throw new Error(data.error || 'Invalid credentials')
      }

      // Backend returns { message, user: { id, email, full_name, role } }
      const user = data.user
      const expiresAt = Date.now() + SESSION_DURATION_MS
      setCurrentUser(user)
      localStorage.setItem('user', JSON.stringify(user))
      localStorage.setItem('sessionExpiresAt', String(expiresAt))
      return user
    } catch (error) {
      throw new Error(error.message || 'Login failed')
    }
  }

  // Logout function
  const logout = () => {
    clearSession()
    navigate('/login')
  }

  const serverUrl = import.meta.env.DEV
    ? (import.meta.env.VITE_DEVELOPMENT_SERVER_URL || '')
    : (import.meta.env.VITE_PRODUCTION_SERVER_URL || '')

  // Re-fetch user info from server and update local state
  const refreshUser = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/auth/me/`, { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      const updated = { ...currentUser, ...data.user }
      setCurrentUser(updated)
      localStorage.setItem('user', JSON.stringify(updated))
    } catch (_) {}
  }

  const value = {
    currentUser,
    login,
    logout,
    refreshUser,
    isAuthenticated: !!currentUser,
    isAdmin: currentUser?.role === 'admin',
    isSessionExpired,
    handleExpiredSession,
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}
