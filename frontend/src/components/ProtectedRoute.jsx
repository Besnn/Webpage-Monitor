import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function ProtectedRoute({ children }) {
  const { isAuthenticated, isSessionExpired } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (isSessionExpired()) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ message: 'Your session has expired. Please log in again.' }}
      />
    )
  }

  return children
}

export default ProtectedRoute
