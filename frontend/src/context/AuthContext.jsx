import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const AuthContext = createContext()

// Default session duration: 24 hours (in milliseconds)
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000

export function useAuth() {
  return useContext(AuthContext)
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
        if (storedUser) {
          // Only redirect if the user was supposed to be logged in
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
      const response = await fetch(
        import.meta.env.DEV
          ? import.meta.env.VITE_DEVELOPMENT_SERVER_URL + '/api/auth/login'
          : import.meta.env.VITE_PRODUCTION_SERVER_URL + '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        }
      )

      if (!response.ok) {
        throw new Error('Invalid credentials')
      }

      const user = await response.json()
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

  const value = {
    currentUser,
    login,
    logout,
    isAuthenticated: !!currentUser,
    isSessionExpired,
    handleExpiredSession,
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}
