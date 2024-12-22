import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'

function Monitor() {
  const { siteId } = useParams()
  const navigate = useNavigate()

  let site
  try {
    const stored = localStorage.getItem('monitoredSites')
    const sites = stored ? JSON.parse(stored) : []
    site = sites.find((item) => String(item.id) === String(siteId))
  } catch (error) {
    site = null
  }

  if (!siteId) {
    return <h1>Monitor Page</h1>
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