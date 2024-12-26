import React, { useEffect, useState } from 'react'
import { useNavigate } from "react-router-dom"
import Button from 'react-bootstrap/Button'
import 'bootstrap/dist/css/bootstrap.css'
import './Home.css'

function Home() {
  const navigate = useNavigate()

  const [server_url,] = useState(import.meta.env.DEV ?
    import.meta.env.VITE_DEVELOPMENT_SERVER_URL : import.meta.env.VITE_PRODUCTION_SERVER_URL)
  const [isValidHttpURL, setIsValidHttpURL] = useState(false)
  const [urlText, setURLText] = useState('')
  const [buttonText, setButtonText] = useState('Enter valid URL')
  const [monitoredSites, setMonitoredSites] = useState([])

  const buildUrl = (path) => {
    const base = (server_url || window.location.origin).replace(/\/$/, '')
    return `${base}${path}`
  }

  useEffect(() => {
    const loadMonitoredSites = async () => {
      try {
        const response = await fetch(buildUrl('/monitor'), { credentials: 'include' })
        if (!response.ok) return
        const data = await response.json()
        setMonitoredSites((data.pages || []).map((page) => ({
          id: page.id,
          url: page.url,
          last_screenshot_url: page.last_screenshot_url || '',
        })))
      } catch (error) {
        if (import.meta.env.DEV) console.error('Error loading monitored sites:', error.message)
      }
    }
    loadMonitoredSites()
  }, [server_url])

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
      const response = await fetch(server_url + '/monitor', {  // server_url is the URL of the server to send the request to
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

  const handleCardClick = (siteId) => {
    navigate(`/monitor/${siteId}`)
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
              <button
                type="button"
                key={site.id}
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
                ) : (
                  <div className="site-card-thumb-placeholder">
                    <span>No screenshot yet</span>
                  </div>
                )}
                <div className="site-card-body">
                  <span className="site-label">{site.url}</span>
                  <span className="site-action">View monitor →</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default Home
