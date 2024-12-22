import React, { useEffect, useState } from 'react'

import { useNavigate } from "react-router-dom"
import Button from 'react-bootstrap/Button'

import 'bootstrap/dist/css/bootstrap.css'

import './Home.css'

import { useAuth } from '../../context/AuthContext'

function Home() {
  const navigate = useNavigate()
  const { currentUser, isAdmin, logout } = useAuth()

  const [server_url,] = useState(import.meta.env.DEV ?
      import.meta.env.VITE_DEVELOPMENT_SERVER_URL : import.meta.env.VITE_PRODUCTION_SERVER_URL)
  const [isValidHttpURL, setIsValidHttpURL] = useState(false)
  const [urlText, setURLText] = useState('')
  const [buttonText, setButtonText] = useState('Enter valid URL')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [monitoredSites, setMonitoredSites] = useState(() => {
    try {
      const stored = localStorage.getItem('monitoredSites')
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem('monitoredSites', JSON.stringify(monitoredSites))
  }, [monitoredSites])

  const handleChange = (newValue) => {
    const isValid = validateURL(newValue)
    setURLText(newValue)
    setIsValidHttpURL(isValid)
    setButtonText(isValid ? 'Click to Monitor' : 'Enter valid URL')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateURL(urlText)) {
      setIsValidHttpURL(false)
      setButtonText('Enter valid URL')
      return
    }

    try {
      /*
      create response with url in body and send it to server at api endpoint monitor
      */
      const response = await fetch(server_url + '/monitor', {  // server_url is the URL of the server to send the request to
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          },
        body: //form data
            JSON.stringify({ webpageURL: urlText })
      })

      if (response.ok) {
        if (import.meta.env.DEV) {
          console.log('Value sent successfully')
        }
        let createdSiteId
        setMonitoredSites((prev) => {
          const existing = prev.find((site) => site.url === urlText)
          if (existing) {
            createdSiteId = existing.id
            return prev
          }
          const next = { id: Date.now(), url: urlText }
          createdSiteId = next.id
          return [...prev, next]
        })
        setURLText('')
        setIsValidHttpURL(false)
        setButtonText('Enter valid URL')
        if (createdSiteId) {
          navigate(`/monitor/${createdSiteId}`)
        } else {
          navigate('/monitor')
        }
      } else if (import.meta.env.DEV) {
        console.error('Failed to send value:', response.statusText)
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error sending value:', error.message)
      }
    }
  }

  const handleCardClick = (siteId) => {
    if (import.meta.env.DEV) {
      console.log('Selected site:', siteId)
    }
    navigate(`/monitor/${siteId}`)
  }

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
    if (action === 'monitor') {
      navigate('/monitor')
      return
    }
    navigate('/')
  }

  const validateURL = (string) => {
    let url
    try {
      url = new URL(string)
    } catch (err) {
      return false
    }
    return url.protocol === "http:" || url.protocol === "https:"
  }

  return (
        <div className="home-page">
          <header className="topbar">
            <div className="brand">Webpage Monitor</div>
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
                  <button type="button" onClick={() => handleMenuAction('monitor')}>Monitor</button>
                  {isAdmin && (
                    <button type="button" onClick={() => handleMenuAction('admin')}>Admin</button>
                  )}
                  <button type="button" onClick={() => handleMenuAction('logout')}>Logout</button>
                </div>
              )}
            </div>
          </header>

          <div id="center-container">
            <div className="intro-text">
              <h1>Monitor websites you care about</h1>
              <p>
                Add the URL of any website you want to monitor. The app builds a dashboard with
                relevant options and stats so you can keep track of changes over time.
              </p>
            </div>
            <div id='searchbox-container'>
              <form onSubmit={handleSubmit}>
                <input
                    onChange={(e) => handleChange(e.target.value)}
                    value={urlText}
                    id='searchbox' type='text' placeholder='Enter URL (for example https://google.com)'
                    autoFocus
                >
                </input>
                <Button id='searchbox-button' onClick={(e) => handleSubmit(e)} disabled={!isValidHttpURL}>
                  {buttonText}
                </Button>
              </form>
            </div>
          </div>

          <section className="dashboard">
            <h2 className="dashboard-title">Monitored Sites</h2>
            {monitoredSites.length === 0 ? (
              <p className="empty-dashboard">No monitored sites yet. Add a URL above to start monitoring.</p>
            ) : (
              <div className="dashboard-grid">
                {monitoredSites.map((site) => (
                  <button
                    type="button"
                    key={site.id}
                    className="site-card"
                    onClick={() => handleCardClick(site.id)}
                  >
                    <span className="site-label">{site.url}</span>
                    <span className="site-action">View monitor</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
  )
}

export default Home