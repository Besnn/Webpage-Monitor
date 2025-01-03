import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from "react-router-dom"
import Button from 'react-bootstrap/Button'
import 'bootstrap/dist/css/bootstrap.css'
import './Home.css'

// ---- Dotted-menu component ----
function CardMenu({ siteId, isPinned, onDelete, onPin }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handle = (action) => (e) => {
    e.stopPropagation()   // don't navigate to the monitor page
    setOpen(false)
    action()
  }

  return (
    <div className="card-menu" ref={ref}>
      <button
        className="card-menu-trigger"
        title="More options"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        aria-label="More options"
      >
        ···
      </button>
      {open && (
        <ul className="card-menu-dropdown" role="menu">
          <li role="menuitem">
            <button className="card-menu-item" onClick={handle(onPin)}>
              {isPinned ? '📌 Unpin' : '📌 Pin to top'}
            </button>
          </li>
          <li role="menuitem">
            <button className="card-menu-item card-menu-item--danger" onClick={handle(onDelete)}>
              🗑 Delete
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

function Home() {
  const navigate = useNavigate()

  const [server_url,] = useState(import.meta.env.DEV ?
    (import.meta.env.VITE_DEVELOPMENT_SERVER_URL || '') : (import.meta.env.VITE_PRODUCTION_SERVER_URL || ''))
  const [isValidHttpURL, setIsValidHttpURL] = useState(false)
  const [urlText, setURLText] = useState('')
  const [buttonText, setButtonText] = useState('Enter valid URL')
  const [monitoredSites, setMonitoredSites] = useState([])

  const buildUrl = (path) => {
    if (!server_url) return path
    return `${server_url.replace(/\/$/, '')}${path}`
  }

  const loadMonitoredSites = useCallback(async () => {
    try {
      const response = await fetch(buildUrl('/monitor'), { credentials: 'include' })
      if (!response.ok) return
      const data = await response.json()
      setMonitoredSites((data.pages || []).map((page) => ({
        id: page.id,
        url: page.url,
        last_screenshot_url: page.last_screenshot_url || '',
        is_up: page.is_up,
        is_pinned: page.is_pinned || false,
        screenshot_missing: page.screenshot_missing || false,
      })))
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading monitored sites:', error.message)
    }
  }, [server_url])

  useEffect(() => { loadMonitoredSites() }, [loadMonitoredSites])

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

    let finalUrl = urlText
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl
    }

    try {
      /*
      create response with url in body and send it to server at api endpoint monitor
      */
      const response = await fetch(buildUrl('/monitor'), {  // server_url is the URL of the server to send the request to
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          },
        credentials: 'include',
        body: //form data
            JSON.stringify({ webpageURL: finalUrl })
      })

      if (response.ok) {
        if (import.meta.env.DEV) {
          console.log('Value sent successfully')
        }
        const data = await response.json()
        const page = data.page
        if (page) {
          setMonitoredSites((prev) => {
            if (prev.some((site) => String(site.id) === String(page.id))) return prev
            return [...prev, { id: page.id, url: page.url }]
          })
          setURLText('')
          setIsValidHttpURL(false)
          setButtonText('Enter valid URL')
          navigate(`/monitor/${page.id}`)
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

  const handleCardClick = (siteId) => { navigate(`/monitor/${siteId}`) }

  const handleDelete = async (siteId) => {
    if (!window.confirm('Delete this site and all its data?')) return
    try {
      await fetch(buildUrl(`/api/monitor/${siteId}/delete/`), {
        method: 'DELETE',
        credentials: 'include',
      })
      setMonitoredSites(prev => prev.filter(s => String(s.id) !== String(siteId)))
    } catch (err) {
      if (import.meta.env.DEV) console.error('Delete failed:', err)
    }
  }

  const handlePin = async (siteId, currentlyPinned) => {
    try {
      await fetch(buildUrl(`/api/monitor/${siteId}/pin/`), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: !currentlyPinned }),
      })
      // Re-fetch so order updates server-side (pinned first)
      await loadMonitoredSites()
    } catch (err) {
      if (import.meta.env.DEV) console.error('Pin failed:', err)
    }
  }

  const validateURL = (string) => {
    let url
    try {
      url = new URL(string)
    } catch (err) {
      try {
        url = new URL(`https://${string}`)
      } catch (err2) {
        return false
      }
    }
    return url.protocol === "http:" || url.protocol === "https:"
  }

  return (
    <div className="home-page">
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
            />
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
              <div key={site.id} className={`site-card-wrap${site.is_pinned ? ' site-card-wrap--pinned' : ''}`}>
                <button
                  type="button"
                  className="site-card"
                  onClick={() => handleCardClick(site.id)}
                >
                  {site.last_screenshot_url ? (
                    <div className="site-card-thumb-wrap">
                      <img
                        src={buildUrl(site.last_screenshot_url)}
                        alt={`Screenshot of ${site.url}`}
                        className="site-card-thumb"
                        loading="lazy"
                      />
                    </div>
                  ) : site.is_up === false ? (
                    <div className="site-card-thumb-placeholder site-card-thumb-placeholder--down">
                      <span className="site-card-thumb-icon">🚫</span>
                      <span>No image</span>
                      <span className="site-card-thumb-sub">Site is down</span>
                    </div>
                  ) : site.screenshot_missing ? (
                    <div className="site-card-thumb-placeholder site-card-thumb-placeholder--missing">
                      <span className="site-card-thumb-icon">🖼️</span>
                      <span>No image</span>
                      <span className="site-card-thumb-sub">Screenshot unavailable</span>
                    </div>
                  ) : (
                    <div className="site-card-thumb-placeholder">
                      <span className="site-card-thumb-icon">⏳</span>
                      <span>Capturing…</span>
                    </div>
                  )}
                  <div className="site-card-body">
                    <span className="site-label">
                      {site.is_pinned && <span className="site-pin-badge" title="Pinned">📌</span>}
                      {site.url}
                    </span>
                    <span className="site-action">View monitor →</span>
                  </div>
                </button>

                <CardMenu
                  siteId={site.id}
                  isPinned={site.is_pinned}
                  onDelete={() => handleDelete(site.id)}
                  onPin={() => handlePin(site.id, site.is_pinned)}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Home
