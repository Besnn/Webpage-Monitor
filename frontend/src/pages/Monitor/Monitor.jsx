import React, { useEffect, useState, useCallback, useRef } from 'react'
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

const formatTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
  return [formatTime(history[0].checked_at), formatTime(history[history.length - 1].checked_at)]
}

const diffScoreBadge = (score) => {
  if (score === null || score === undefined) return null
  let bg = 'success'
  let label = 'No change'
  if (score > 0 && score <= 10) { bg = 'warning'; label = `${score}% changed` }
  else if (score > 10) { bg = 'danger'; label = `${score}% changed` }
  return <Badge bg={bg} className="ms-1">{label}</Badge>
}

/* ---------- Small reusable components ---------- */

/** Image with loading spinner overlay */
function ScreenshotImage({ src, alt, className, onClick }) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)

  return (
    <div className={`screenshot-img-wrapper ${loaded ? 'loaded' : ''}`}>
      {!loaded && !errored && (
        <div className="screenshot-loading">
          <Spinner animation="border" size="sm" /> Loading…
        </div>
      )}
      {errored && (
        <div className="screenshot-loading screenshot-error">⚠️ Failed to load image</div>
      )}
      <img
        src={src}
        alt={alt}
        className={`screenshot-img ${className || ''}`}
        style={{ display: errored ? 'none' : undefined }}
        onClick={onClick}
        onLoad={() => setLoaded(true)}
        onError={() => { setErrored(true); setLoaded(true) }}
      />
    </div>
  )
}

/** Overlay comparison slider — two images on top of each other with a draggable divider */
function OverlaySlider({ beforeSrc, afterSrc, beforeLabel, afterLabel }) {
  const containerRef = useRef(null)
  const [position, setPosition] = useState(50)
  const [containerWidth, setContainerWidth] = useState(0)
  const dragging = useRef(false)

  // Track container width so the "before" image can match the full width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    ro.observe(el)
    setContainerWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  const updatePosition = useCallback((clientX) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    setPosition((x / rect.width) * 100)
  }, [])

  const onPointerDown = useCallback((e) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    updatePosition(e.clientX)
  }, [updatePosition])

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return
    updatePosition(e.clientX)
  }, [updatePosition])

  const onPointerUp = useCallback(() => { dragging.current = false }, [])

  return (
    <div
      className="overlay-slider"
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* After (full width, behind) */}
      <img src={afterSrc} alt={afterLabel || 'After'} className="overlay-slider-img" draggable={false} />
      {/* Before (clipped) */}
      <div className="overlay-slider-before" style={{ width: `${position}%` }}>
        <img
          src={beforeSrc}
          alt={beforeLabel || 'Before'}
          className="overlay-slider-img"
          draggable={false}
          style={{ width: containerWidth ? `${containerWidth}px` : '100%' }}
        />
      </div>
      {/* Divider handle */}
      <div className="overlay-slider-handle" style={{ left: `${position}%` }}>
        <div className="overlay-slider-line" />
        <div className="overlay-slider-knob">⇔</div>
      </div>
      {/* Labels */}
      <span className="overlay-slider-label overlay-slider-label-left">{beforeLabel || 'Before'}</span>
      <span className="overlay-slider-label overlay-slider-label-right">{afterLabel || 'After'}</span>
    </div>
  )
}

/** Visual-change sparkline (diff_score over time) */
function DiffSparkline({ history }) {
  const points = history.filter(h => h.diff_score !== null && h.diff_score !== undefined)
  if (points.length < 2) return null

  const w = 320
  const h = 60
  const pad = 4
  const maxScore = Math.max(...points.map(p => p.diff_score), 1)
  const iw = w - pad * 2
  const ih = h - pad * 2

  const polyline = points.map((p, i) => {
    const x = pad + (iw * i) / Math.max(points.length - 1, 1)
    const y = pad + ih - (p.diff_score / maxScore) * ih
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="diff-sparkline-wrapper">
      <span className="diff-sparkline-title">Visual Δ over time</span>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="diff-sparkline-svg">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e5e7eb" strokeWidth="1" />
        <polyline fill="none" stroke="#e74c3c" strokeWidth="2" points={polyline} />
        {points.map((p, i) => {
          const x = pad + (iw * i) / Math.max(points.length - 1, 1)
          const y = pad + ih - (p.diff_score / maxScore) * ih
          return <circle key={i} cx={x} cy={y} r="3" fill={p.diff_score > 10 ? '#e74c3c' : p.diff_score > 0 ? '#f39c12' : '#27ae60'} />
        })}
      </svg>
      <div className="diff-sparkline-axis">
        <span>{formatTime(points[0].checked_at)}</span>
        <span>{Math.round(maxScore)}%</span>
        <span>{formatTime(points[points.length - 1].checked_at)}</span>
      </div>
    </div>
  )
}

/* ================= Main component ================= */

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
    alertThreshold: 3,
    screenshotEnabled: false,
  })

  // Screenshot viewer state
  const [screenshotTab, setScreenshotTab] = useState('latest')
  // Track when data was last refreshed
  const [lastRefreshed, setLastRefreshed] = useState(null)

  // Lightbox state — index into screenshotLogs array, or null
  const [lightboxIndex, setLightboxIndex] = useState(null)

  // --- Auto-refreshing data loader ---
  const POLL_INTERVAL_MS = 30_000 // refresh every 30 seconds

  const loadSiteData = useCallback(async (showSpinner = false) => {
    if (!siteId) return
    try {
      if (showSpinner) { setIsLoading(true) }
      setError(null)

      const detail = await fetchJson(buildApiUrl(`/api/monitor/${siteId}/`))
      setSite(detail.site)
      setSummary(detail.summary)
      setLogs(detail.checks || [])

      setSettingsData({
        url: detail.site.url || '',
        checkInterval: detail.site.check_interval || 5,
        notificationsEnabled: detail.site.notifications_enabled || false,
        alertThreshold: detail.site.alert_threshold || 3,
        screenshotEnabled: detail.site.screenshot_enabled || false,
      })

      const historyData = await fetchJson(buildApiUrl(`/api/monitor/${siteId}/history/?hours=24`))
      setHistory(historyData.history || [])
      setLastRefreshed(new Date())
    } catch (err) {
      setError(err.message || 'Failed to load site data')
      setSite(null); setSummary(null); setLogs([]); setHistory([])
    } finally {
      if (showSpinner) { setIsLoading(false) }
    }
  }, [siteId])

  useEffect(() => {
    if (!siteId) { setIsLoading(false); return }

    // Initial load with spinner
    loadSiteData(true)

    // Poll for updates
    const timer = setInterval(() => loadSiteData(false), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [siteId, loadSiteData])

  /* ---- early returns ---- */
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
        <Spinner animation="border" role="status"><span className="visually-hidden">Loading...</span></Spinner>
        <p className="mt-3">Loading site details...</p>
      </Container>
    )
  }

  if (error || !site) {
    return (
      <Container className="monitor-page">
        <Alert variant="danger"><h4>Error</h4><p>{error || 'Site not found.'}</p></Alert>
        <Button variant="secondary" onClick={() => navigate('/')}>Back to Dashboard</Button>
      </Container>
    )
  }

  /* ---- chart helpers ---- */
  const chartWidth = 720
  const chartHeight = 220
  const chartPadding = 24
  const chartPoints = buildChartPoints(history, chartWidth, chartHeight, chartPadding)
  const chartTicks = buildChartTicks(history)
  const chartTimeLabels = buildTimeAxis(history)
  const guideLineCount = 3
  const guideLinePositions = Array.from({ length: guideLineCount }, (_, i) => {
    const step = (chartHeight - chartPadding * 2) / (guideLineCount + 1)
    return chartPadding + step * (i + 1)
  })

  /* ---- settings handlers ---- */
  const handleSettingsOpen = () => setShowSettings(true)
  const handleSettingsClose = () => setShowSettings(false)
  const handleSettingsChange = (field, value) => setSettingsData(prev => ({ ...prev, [field]: value }))
  const handleSettingsSave = async () => {
    try {
      const response = await fetchJson(buildApiUrl(`/api/monitor/${siteId}/settings/`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsData)
      })
      if (response.site) setSite(response.site)
      setShowSettings(false)
      window.location.reload()
    } catch (err) {
      console.error('Failed to save settings:', err)
      alert(`Failed to save settings: ${err.message}`)
    }
  }

  /* ---- screenshot data ---- */
  const hasScreenshot = !!summary?.last_screenshot_url
  const hasDiff = !!summary?.last_diff_url

  // All logs with a screenshot, ordered newest-first (same as logs)
  const screenshotLogs = logs.filter(l => l.screenshot_url)
  const prevScreenshot = screenshotLogs.length > 1 ? screenshotLogs[1] : null

  // Lightbox navigation helpers
  const lightboxOpen = lightboxIndex !== null && screenshotLogs[lightboxIndex]
  const lightboxLog = lightboxOpen ? screenshotLogs[lightboxIndex] : null

  const openLightboxForLog = (log) => {
    const idx = screenshotLogs.findIndex(l => l.id === log.id)
    setLightboxIndex(idx >= 0 ? idx : 0)
  }
  const openLightboxForUrl = (url) => {
    // find the log whose screenshot_url matches
    const idx = screenshotLogs.findIndex(l => buildApiUrl(l.screenshot_url) === url)
    setLightboxIndex(idx >= 0 ? idx : 0)
  }
  const lightboxPrev = () => setLightboxIndex(i => Math.min((i ?? 0) + 1, screenshotLogs.length - 1))
  const lightboxNext = () => setLightboxIndex(i => Math.max((i ?? 0) - 1, 0))

  return (
    <Container className="monitor-page">
      {/* ---- Header ---- */}
      <div className="monitor-header">
        <div className="monitor-title">
          <h1>Site Dashboard</h1>
          <div className="monitor-url">{site.url}</div>
          <div className="monitor-refresh-bar">
            <span className="text-muted small">
              {lastRefreshed ? `Updated ${formatTimestamp(lastRefreshed)}` : ''}
              &nbsp;·&nbsp;Auto-refreshes every 30s
            </span>
            <Button size="sm" variant="link" className="p-0 ms-2" onClick={() => loadSiteData(false)} title="Refresh now">
              🔄
            </Button>
          </div>
        </div>
        <div className="monitor-header-actions">
          <Button variant="outline-primary" onClick={handleSettingsOpen} className="me-2">⚙️ Settings</Button>
          <Button variant="outline-secondary" onClick={() => navigate('/')}>&larr; Back</Button>
        </div>
      </div>

      {/* ---- Stat cards ---- */}
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
        {site.screenshot_enabled && (
          <div className="stat-card">
            <div className="stat-label">Visual Change</div>
            <div className="stat-value">
              {summary?.last_diff_score !== null && summary?.last_diff_score !== undefined
                ? <>{summary.last_diff_score}% {diffScoreBadge(summary.last_diff_score)}</>
                : '—'}
            </div>
          </div>
        )}
      </div>

      {/* ============================================================
           SCREENSHOT VISUALIZATION SECTION
           ============================================================ */}
      {site.screenshot_enabled && (
        <Row className="mb-4">
          <Col>
            <div className="screenshot-section">
              <div className="screenshot-section-header">
                <h5>📸 Screenshots &amp; Visual Diff</h5>
                <div className="screenshot-tabs">
                  {['latest', 'diff', 'overlay', 'side'].map(tab => (
                    <Button
                      key={tab}
                      size="sm"
                      variant={screenshotTab === tab ? 'primary' : 'outline-secondary'}
                      onClick={() => setScreenshotTab(tab)}
                      disabled={
                        (tab === 'diff' && !hasDiff) ||
                        (tab === 'overlay' && !prevScreenshot) ||
                        (tab === 'side' && !prevScreenshot)
                      }
                    >
                      {tab === 'latest' && 'Latest'}
                      {tab === 'diff' && 'Diff'}
                      {tab === 'overlay' && 'Overlay'}
                      {tab === 'side' && 'Side by Side'}
                    </Button>
                  ))}
                </div>
              </div>

              {!hasScreenshot ? (
                <div className="chart-placeholder">
                  No screenshots yet. Enable screenshots in Settings and wait for the next check.
                </div>
              ) : (
                <div className="screenshot-content">
                  {/* --- Latest tab --- */}
                  {screenshotTab === 'latest' && (
                    <div className="screenshot-single">
                      <ScreenshotImage
                        src={buildApiUrl(summary.last_screenshot_url)}
                        alt="Latest screenshot"
                        onClick={() => openLightboxForUrl(buildApiUrl(summary.last_screenshot_url))}
                      />
                      <p className="screenshot-caption">
                        Captured {summary?.last_checked_at ? formatTimestamp(summary.last_checked_at) : ''}
                        &nbsp;·&nbsp;Click to enlarge
                      </p>
                    </div>
                  )}

                  {/* --- Diff tab --- */}
                  {screenshotTab === 'diff' && hasDiff && (
                    <div className="screenshot-single">
                      <div className="diff-score-banner">
                        Change score: <strong>{summary.last_diff_score ?? 0}%</strong>
                        {diffScoreBadge(summary.last_diff_score)}
                      </div>
                      <ScreenshotImage
                        src={buildApiUrl(summary.last_diff_url)}
                        alt="Visual diff"
                        className="diff-img"
                        onClick={() => setLightboxIndex(null)}
                      />
                      <p className="screenshot-caption">
                        Highlighted pixel differences between the last two checks.
                        Brighter areas = more change.
                      </p>
                    </div>
                  )}

                  {/* --- Overlay slider tab --- */}
                  {screenshotTab === 'overlay' && prevScreenshot && (
                    <div className="screenshot-single">
                      <p className="screenshot-caption mb-2" style={{ marginBottom: '0.5rem' }}>
                        Drag the slider to compare previous ↔ latest
                      </p>
                      <OverlaySlider
                        beforeSrc={buildApiUrl(prevScreenshot.screenshot_url)}
                        afterSrc={buildApiUrl(summary.last_screenshot_url)}
                        beforeLabel="Previous"
                        afterLabel="Latest"
                      />
                    </div>
                  )}

                  {/* --- Side by side tab --- */}
                  {screenshotTab === 'side' && prevScreenshot && (
                    <div className="screenshot-side-by-side">
                      <div className="screenshot-panel">
                        <h6>Previous</h6>
                        <ScreenshotImage
                          src={buildApiUrl(prevScreenshot.screenshot_url)}
                          alt="Previous screenshot"
                          onClick={() => openLightboxForLog(prevScreenshot)}
                        />
                        <p className="screenshot-caption">{formatTimestamp(prevScreenshot.checked_at)}</p>
                      </div>
                      <div className="screenshot-panel">
                        <h6>Latest</h6>
                        <ScreenshotImage
                          src={buildApiUrl(summary.last_screenshot_url)}
                          alt="Latest screenshot"
                          onClick={() => openLightboxForUrl(buildApiUrl(summary.last_screenshot_url))}
                        />
                        <p className="screenshot-caption">{summary?.last_checked_at ? formatTimestamp(summary.last_checked_at) : ''}</p>
                      </div>
                    </div>
                  )}

                  {/* --- Thumbnail gallery --- */}
                  {screenshotLogs.length > 0 && (
                    <div className="screenshot-gallery">
                      <div className="screenshot-gallery-label">Recent screenshots</div>
                      <div className="screenshot-gallery-strip">
                        {screenshotLogs.map((log, idx) => (
                          <button
                            key={log.id}
                            className={`screenshot-thumb-btn ${idx === 0 ? 'active' : ''}`}
                            onClick={() => openLightboxForLog(log)}
                            title={formatTimestamp(log.checked_at)}
                          >
                            <img
                              src={buildApiUrl(log.screenshot_url)}
                              alt={`Check ${formatTime(log.checked_at)}`}
                              className="screenshot-thumb"
                            />
                            <span className="screenshot-thumb-time">{formatTime(log.checked_at)}</span>
                            {log.diff_score !== null && log.diff_score !== undefined && (
                              <span className={`screenshot-thumb-dot ${log.diff_score > 10 ? 'red' : log.diff_score > 0 ? 'yellow' : 'green'}`} />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* --- Visual-change sparkline --- */}
                  <DiffSparkline history={history} />
                </div>
              )}
            </div>
          </Col>
        </Row>
      )}

      {/* ---- Response time chart ---- */}
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
                    <line x1={chartPadding} y1={chartPadding} x2={chartWidth - chartPadding} y2={chartPadding} stroke="#e5e7eb" strokeWidth="1" />
                    {guideLinePositions.map((yPos) => (
                      <line key={`guide-${yPos}`} x1={chartPadding} y1={yPos} x2={chartWidth - chartPadding} y2={yPos} stroke="#eef2f7" strokeWidth="1" />
                    ))}
                    <line x1={chartPadding} y1={chartHeight - chartPadding} x2={chartWidth - chartPadding} y2={chartHeight - chartPadding} stroke="#e5e7eb" strokeWidth="1" />
                    <polyline fill="none" stroke="#4361ee" strokeWidth="3" points={chartPoints} />
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

      {/* ---- Recent checks table ---- */}
      <div className="monitor-logs-section">
        <div className="logs-header">Recent Checks</div>
        <Table responsive hover className="mb-0">
          <thead>
            <tr>
              <th>Time</th>
              <th>Status</th>
              <th>Response Time</th>
              <th>Message</th>
              {site.screenshot_enabled && <th>Screenshot</th>}
              {site.screenshot_enabled && <th>Visual Δ</th>}
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{formatTimestamp(log.checked_at)}</td>
                <td>
                  <Badge bg={log.is_up ? 'success' : 'danger'}>{log.is_up ? 'UP' : 'DOWN'}</Badge>
                  <span className="ms-2 text-muted small">({log.status_code ?? 'ERR'})</span>
                </td>
                <td>{log.response_time_ms ? `${log.response_time_ms}ms` : '—'}</td>
                <td>{log.message || '—'}</td>
                {site.screenshot_enabled && (
                  <td>
                    {log.screenshot_url ? (
                      <Button size="sm" variant="outline-primary" onClick={() => openLightboxForLog(log)}>
                        🖼️ View
                      </Button>
                    ) : '—'}
                  </td>
                )}
                {site.screenshot_enabled && (
                  <td>{log.diff_score !== null && log.diff_score !== undefined ? diffScoreBadge(log.diff_score) : '—'}</td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      {/* ============================================================
           SCREENSHOT LIGHTBOX with prev/next navigation
           ============================================================ */}
      <Modal show={lightboxOpen} onHide={() => setLightboxIndex(null)} size="xl" centered dialogClassName="screenshot-lightbox-dialog">
        <Modal.Header closeButton>
          <Modal.Title>
            Screenshot
            {lightboxLog && (
              <span className="ms-2 text-muted" style={{ fontSize: '0.85rem' }}>
                {formatTimestamp(lightboxLog.checked_at)}
                {lightboxLog.diff_score !== null && lightboxLog.diff_score !== undefined && (
                  <> · {diffScoreBadge(lightboxLog.diff_score)}</>
                )}
              </span>
            )}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center p-0 position-relative">
          {lightboxLog && (
            <>
              <img
                src={buildApiUrl(lightboxLog.screenshot_url)}
                alt="Screenshot full view"
                className="lightbox-main-img"
              />
              {/* Navigation arrows */}
              {lightboxIndex < screenshotLogs.length - 1 && (
                <button className="lightbox-nav lightbox-nav-left" onClick={lightboxPrev} title="Older screenshot">
                  ‹
                </button>
              )}
              {lightboxIndex > 0 && (
                <button className="lightbox-nav lightbox-nav-right" onClick={lightboxNext} title="Newer screenshot">
                  ›
                </button>
              )}
              <div className="lightbox-counter">
                {lightboxIndex + 1} / {screenshotLogs.length}
              </div>
            </>
          )}
        </Modal.Body>
      </Modal>

      {/* ---- Settings Modal ---- */}
      <Modal show={showSettings} onHide={handleSettingsClose} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Site Settings</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Site URL</Form.Label>
              <Form.Control type="url" value={settingsData.url} onChange={(e) => handleSettingsChange('url', e.target.value)} placeholder="https://example.com" />
              <Form.Text className="text-muted">The URL to monitor for uptime and performance.</Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Check Interval (minutes)</Form.Label>
              <Form.Control type="number" min="1" max="60" value={settingsData.checkInterval} onChange={(e) => handleSettingsChange('checkInterval', parseInt(e.target.value) || 5)} />
              <Form.Text className="text-muted">How often to check the site status (1-60 minutes).</Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Check type="checkbox" label="Enable Notifications" checked={settingsData.notificationsEnabled} onChange={(e) => handleSettingsChange('notificationsEnabled', e.target.checked)} />
              <Form.Text className="text-muted">Receive notifications when the site goes down or comes back up.</Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Alert Threshold</Form.Label>
              <Form.Control type="number" min="1" max="10" value={settingsData.alertThreshold} onChange={(e) => handleSettingsChange('alertThreshold', parseInt(e.target.value) || 3)} />
              <Form.Text className="text-muted">Number of consecutive failed checks before sending an alert (1-10).</Form.Text>
            </Form.Group>

            <hr />

            <h6>📸 Screenshot &amp; Visual Change Detection</h6>
            <Form.Group className="mb-3">
              <Form.Check type="checkbox" label="Enable Screenshots" checked={settingsData.screenshotEnabled} onChange={(e) => handleSettingsChange('screenshotEnabled', e.target.checked)} />
              <Form.Text className="text-muted">
                Capture a full-page screenshot on each check and detect visual changes between consecutive checks. Screenshots are stored locally.
              </Form.Text>
            </Form.Group>

            <div className="settings-info-section">
              <h6>Site Information</h6>
              <div className="info-row"><span className="info-label">Site ID:</span><span className="info-value">{site.id}</span></div>
              <div className="info-row"><span className="info-label">Created:</span><span className="info-value">{formatTimestamp(site.created_at)}</span></div>
              <div className="info-row">
                <span className="info-label">Current Status:</span>
                <span className="info-value">
                  <Badge bg={summary?.current_status === 'UP' ? 'success' : 'danger'}>{summary?.current_status || 'Unknown'}</Badge>
                </span>
              </div>
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleSettingsClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSettingsSave}>Save Changes</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}

export default Monitor
