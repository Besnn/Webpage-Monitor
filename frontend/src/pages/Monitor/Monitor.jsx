import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

function Monitor() {
  const { siteId } = useParams()
  const navigate = useNavigate()
  const [site, setSite] = useState(null)
  const [isLoading, setIsLoading] = useState(Boolean(siteId))

  useEffect(() => {
    if (!siteId) return

    const loadSite = async () => {
      try {
        const response = await fetch(`${import.meta.env.DEV ? import.meta.env.VITE_DEVELOPMENT_SERVER_URL : import.meta.env.VITE_PRODUCTION_SERVER_URL}/monitor`, {
          credentials: 'include',
        })
        if (!response.ok) {
          setSite(null)
          return
        }
        const data = await response.json()
        const match = (data.pages || []).find((item) => String(item.id) === String(siteId))
        setSite(match || null)
      } catch (error) {
        setSite(null)
      } finally {
        setIsLoading(false)
      }
    }

    loadSite()
  }, [siteId])

  if (!siteId) {
    return <h1>Monitor Page</h1>
  }

  if (isLoading) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1>Monitor</h1>
        <p>Loading site details...</p>
      </div>
    )
  }

  if (!site) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1>Monitor</h1>
        <p>We could not find that monitored site.</p>
        <button type="button" onClick={() => navigate('/')}>Back to dashboard</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Monitoring</h1>
      <p>{site.url}</p>
    </div>
  )
}

export default Monitor