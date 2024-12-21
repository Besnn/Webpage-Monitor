import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function AdminRoute({ children }) {
  const { isAuthenticated, isSessionExpired, isAdmin } = useAuth()

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

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return children
}

export default AdminRoute

