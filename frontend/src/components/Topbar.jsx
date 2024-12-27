import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import './Topbar.css'

function Topbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser, isAdmin, logout, isAuthenticated } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const toggleMenu = () => {
    setIsMenuOpen((open) => !open)
  }

  const handleMenuAction = (action) => {
    setIsMenuOpen(false)
    if (action === 'logout') {
      logout()
      return
    }
    if (action === 'admin') {
      navigate('/admin')
      return
    }
    if (action === 'settings') {
      navigate('/settings')
      return
    }
    if (action === 'monitor') {
      navigate('/monitor')
      return
    }
    navigate('/')
  }

  const hideOnRoutes = ['/login', '/register']
  if (!isAuthenticated || hideOnRoutes.includes(location.pathname)) {
    return null
  }

  return (
    <header className="topbar">
      <div className="brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
        Webpage Monitor
      </div>
      <div className="topbar-actions">
        <div className="user-chip">
          {currentUser?.full_name || currentUser?.email || 'User'}
        </div>
        <button type="button" className="menu-button" onClick={toggleMenu} aria-label="Open menu">
          &#9776;
        </button>
        {isMenuOpen && (
          <div className="menu-dropdown">
            <button type="button" onClick={() => handleMenuAction('home')}>Home</button>
            {isAdmin && (
              <button type="button" onClick={() => handleMenuAction('admin')}>Admin</button>
            )}
            <button type="button" onClick={() => handleMenuAction('settings')}>Settings</button>
            <button type="button" onClick={() => handleMenuAction('logout')}>Logout</button>
          </div>
        )}
      </div>
    </header>
  )
}

export default Topbar
