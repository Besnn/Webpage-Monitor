import React, { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext()

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Check if user is already logged in (from localStorage)
  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser))
      } catch (error) {
        console.error('Error parsing stored user:', error)
        localStorage.removeItem('user')
      }
    }
    setLoading(false)
  }, [])

  // Login function - you can replace this with actual API call
  const login = async (username, password) => {
    try {
      // Replace with your actual backend API endpoint
        const response = await fetch(import.meta.env.DEV ? import.meta.env.VITE_DEVELOPMENT_SERVER_URL + '/api/auth/login' : import.meta.env.VITE_PRODUCTION_SERVER_URL + '/api/auth/login', {
            method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        throw new Error('Invalid credentials')
      }

      const user = await response.json()
      setCurrentUser(user)
      localStorage.setItem('user', JSON.stringify(user))
      return user
    } catch (error) {
      throw new Error(error.message || 'Login failed')
    }
  }

  // Logout function
  const logout = () => {
    setCurrentUser(null)
    localStorage.removeItem('user')
  }

  const value = {
    currentUser,
    login,
    logout,
    isAuthenticated: !!currentUser
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}
