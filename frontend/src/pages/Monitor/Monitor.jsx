import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Container, Row, Col, Table, Badge, Button, Spinner, Alert, Modal, Form } from 'react-bootstrap'
import './Monitor.css'

const API_BASE_URL = import.meta.env.DEV
  ? import.meta.env.VITE_DEVELOPMENT_SERVER_URL
  : import.meta.env.VITE_PRODUCTION_SERVER_URL

const normalizeBaseUrl = (baseUrl) => {
  if (!baseUrl) return ''
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

const buildApiUrl = (path) => {
  const normalizedBase = normalizeBaseUrl(API_BASE_URL) || window.location.origin
  return `${normalizedBase}${path.startsWith('/') ? path : `/${path}`}`
}

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, { credentials: 'include', ...options })
  let data
  try {
    data = await response.json()
  } catch (error) {
    data = null
  }

  if (!response.ok) {
    const message = data?.error || data?.detail || 'Request failed'
    throw new Error(message)
  }

  return data || {}
}

const formatTimestamp = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return date.toLocaleString()
}

const buildChartPoints = (history, width, height, padding) => {
  if (!history.length) return ''
  const maxTime = Math.max(...history.map((item) => item.response_time_ms || 0), 1)
  const minTime = Math.min(...history.map((item) => item.response_time_ms || 0))
  const range = Math.max(maxTime - minTime, 1)
  const innerWidth = width - padding * 2
  const innerHeight = height - padding * 2

  return history
    .map((item, index) => {
      const x = padding + (innerWidth * index) / Math.max(history.length - 1, 1)
      const value = item.response_time_ms || 0
      const y = padding + innerHeight - ((value - minTime) / range) * innerHeight
      return `${x},${y}`
    })
    .join(' ')
}

const buildChartTicks = (history) => {
  if (!history.length) return { min: 0, max: 0 }
  const maxTime = Math.max(...history.map((item) => item.response_time_ms || 0), 1)
  const minTime = Math.min(...history.map((item) => item.response_time_ms || 0))
  return { min: Math.round(minTime), max: Math.round(maxTime) }
}

const buildTimeAxis = (history) => {
  if (!history.length) return []
  const format = (value) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return [format(history[0].checked_at), format(history[history.length - 1].checked_at)]
}

function Monitor() {
  const { siteId } = useParams()
  const navigate = useNavigate()
  const [site, setSite] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [logs, setLogs] = useState([])
  const [summary, setSummary] = useState(null)
  const [history, setHistory] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [settingsData, setSettingsData] = useState({
    url: '',
    checkInterval: 5,
    notificationsEnabled: false,
    alertThreshold: 3
  })

  useEffect(() => {
    if (!siteId) {
      setIsLoading(false)
      return
    }

    const loadSiteData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const detail = await fetchJson(buildApiUrl(`/api/monitor/${siteId}/`))
        setSite(detail.site)
        setSummary(detail.summary)
        setLogs(detail.checks || [])

        // Initialize settings data from site info
        setSettingsData({
          url: detail.site.url || '',
          checkInterval: detail.site.check_interval || 5,
          notificationsEnabled: detail.site.notifications_enabled || false,
          alertThreshold: detail.site.alert_threshold || 3
        })

        const historyData = await fetchJson(buildApiUrl(`/api/monitor/${siteId}/history/?hours=24`))
        setHistory(historyData.history || [])
      } catch (err) {
        setError(err.message || 'Failed to load site data')
        setSite(null)
        setSummary(null)
        setLogs([])
        setHistory([])
      } finally {
        setIsLoading(false)
      }
    }

    loadSiteData()
  }, [siteId])

  if (!siteId) {
    return (
      <Container className="monitor-page">
        <Alert variant="warning">No site ID provided.</Alert>
        <Button variant="primary" onClick={() => navigate('/')}>Back to Dashboard</Button>
      </Container>
    )
  }

  if (isLoading) {
    return (
      <Container className="monitor-page text-center" style={{ paddingTop: '4rem' }}>
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
        <p className="mt-3">Loading site details...</p>
      </Container>
    )
  }

  if (error || !site) {
    return (
      <Container className="monitor-page">
        <Alert variant="danger">
          <h4>Error</h4>
          <p>{error || 'Site not found.'}</p>
        </Alert>
        <Button variant="secondary" onClick={() => navigate('/')}>Back to Dashboard</Button>
      </Container>
    )
  }

  const chartWidth = 720
  const chartHeight = 220
  const chartPadding = 24
  const chartPoints = buildChartPoints(history, chartWidth, chartHeight, chartPadding)
  const chartTicks = buildChartTicks(history)
  const chartTimeLabels = buildTimeAxis(history)
  const guideLineCount = 3

  const guideLinePositions = Array.from({ length: guideLineCount }, (_, index) => {
    const step = (chartHeight - chartPadding * 2) / (guideLineCount + 1)
    return chartPadding + step * (index + 1)
  })

  const handleSettingsOpen = () => {
    setShowSettings(true)
  }

  const handleSettingsClose = () => {
    setShowSettings(false)
  }

  const handleSettingsChange = (field, value) => {
    setSettingsData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSettingsSave = async () => {
    try {
      const response = await fetchJson(buildApiUrl(`/api/monitor/${siteId}/settings/`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsData)
      })

      // Update the site data with the new settings
      if (response.site) {
        setSite(response.site)
      }

      setShowSettings(false)
      // Optionally reload the page data to reflect changes
      window.location.reload()
    } catch (err) {
      console.error('Failed to save settings:', err)
      alert(`Failed to save settings: ${err.message}`)
    }
  }

  return (
    <Container className="monitor-page">
      <div className="monitor-header">
        <div className="monitor-title">
          <h1>Site Dashboard</h1>
          <div className="monitor-url">{site.url}</div>
        </div>
        <div className="monitor-header-actions">
          <Button variant="outline-primary" onClick={handleSettingsOpen} className="me-2">
            ⚙️ Settings
          </Button>
          <Button variant="outline-secondary" onClick={() => navigate('/')}>
            &larr; Back
          </Button>
        </div>
      </div>

      <div className="monitor-stats-grid">
        <div className="stat-card">
          <div className="stat-label">Current Status</div>
          <div className={`stat-value ${summary?.current_status === 'UP' ? 'success' : 'danger'}`}>
            {summary?.current_status || 'Unknown'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Check</div>
          <div className="stat-value" style={{ fontSize: '1.2rem' }}>
            {summary?.last_checked_at ? formatTimestamp(summary.last_checked_at) : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Status Code</div>
          <div className="stat-value">{summary?.last_status_code ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Response</div>
          <div className="stat-value">
            {summary?.last_response_time_ms ? `${summary.last_response_time_ms}ms` : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Uptime</div>
          <div className="stat-value">
            {typeof summary?.uptime_percent === 'number' ? `${summary.uptime_percent}%` : '—'}
          </div>
        </div>
      </div>

      <Row className="mb-4">
        <Col>
          <div className="monitor-chart-section">
            <h5>Response Time History (24h)</h5>
            {history.length === 0 ? (
              <div className="chart-placeholder">No history yet. Run the checker to populate data.</div>
            ) : (
              <div className="chart-wrapper">
                <div className="chart-plot">
                  <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                    <line
                      x1={chartPadding}
                      y1={chartPadding}
                      x2={chartWidth - chartPadding}
                      y2={chartPadding}
                      stroke="#e5e7eb"
                      strokeWidth="1"
                    />
                    {guideLinePositions.map((yPos) => (
                      <line
                        key={`guide-${yPos}`}
                        x1={chartPadding}
                        y1={yPos}
                        x2={chartWidth - chartPadding}
                        y2={yPos}
                        stroke="#eef2f7"
                        strokeWidth="1"
                      />
                    ))}
                    <line
                      x1={chartPadding}
                      y1={chartHeight - chartPadding}
                      x2={chartWidth - chartPadding}
                      y2={chartHeight - chartPadding}
                      stroke="#e5e7eb"
                      strokeWidth="1"
                    />
                    <polyline
                      fill="none"
                      stroke="#4361ee"
                      strokeWidth="3"
                      points={chartPoints}
                    />
                    <circle cx={chartPadding} cy={chartHeight - chartPadding} r="3" fill="#4361ee" />
                  </svg>
                  <div className="chart-axis" aria-hidden="true">
                    <span className="chart-axis-label">{chartTicks.max}ms</span>
                    <span className="chart-axis-label">{chartTicks.min}ms</span>
                  </div>
                </div>
                {chartTimeLabels.length === 2 && (
                  <div className="chart-time-axis">
                    <span>{chartTimeLabels[0]}</span>
                    <span>{chartTimeLabels[1]}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </Col>
      </Row>

      <div className="monitor-logs-section">
        <div className="logs-header">Recent Checks</div>
        <Table responsive hover className="mb-0">
          <thead>
            <tr>
              <th>Time</th>
              <th>Status</th>
              <th>Response Time</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{formatTimestamp(log.checked_at)}</td>
                <td>
                  <Badge bg={log.is_up ? 'success' : 'danger'}>
                    {log.is_up ? 'UP' : 'DOWN'}
                  </Badge>
                  <span className="ms-2 text-muted small">({log.status_code ?? 'ERR'})</span>
                </td>
                <td>{log.response_time_ms ? `${log.response_time_ms}ms` : '—'}</td>
                <td>{log.message || '—'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      {/* Settings Modal */}
      <Modal show={showSettings} onHide={handleSettingsClose} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Site Settings</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Site URL</Form.Label>
              <Form.Control
                type="url"
                value={settingsData.url}
                onChange={(e) => handleSettingsChange('url', e.target.value)}
                placeholder="https://example.com"
              />
              <Form.Text className="text-muted">
                The URL to monitor for uptime and performance.
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Check Interval (minutes)</Form.Label>
              <Form.Control
                type="number"
                min="1"
                max="60"
                value={settingsData.checkInterval}
                onChange={(e) => handleSettingsChange('checkInterval', parseInt(e.target.value) || 5)}
              />
              <Form.Text className="text-muted">
                How often to check the site status (1-60 minutes).
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="Enable Notifications"
                checked={settingsData.notificationsEnabled}
                onChange={(e) => handleSettingsChange('notificationsEnabled', e.target.checked)}
              />
              <Form.Text className="text-muted">
                Receive notifications when the site goes down or comes back up.
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Alert Threshold</Form.Label>
              <Form.Control
                type="number"
                min="1"
                max="10"
                value={settingsData.alertThreshold}
                onChange={(e) => handleSettingsChange('alertThreshold', parseInt(e.target.value) || 3)}
              />
              <Form.Text className="text-muted">
                Number of consecutive failed checks before sending an alert (1-10).
              </Form.Text>
            </Form.Group>

            <div className="settings-info-section">
              <h6>Site Information</h6>
              <div className="info-row">
                <span className="info-label">Site ID:</span>
                <span className="info-value">{site.id}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Created:</span>
                <span className="info-value">{formatTimestamp(site.created_at)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Current Status:</span>
                <span className="info-value">
                  <Badge bg={summary?.current_status === 'UP' ? 'success' : 'danger'}>
                    {summary?.current_status || 'Unknown'}
                  </Badge>
                </span>
              </div>
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleSettingsClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSettingsSave}>
            Save Changes
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}

export default Monitor
