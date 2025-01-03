import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Container, Row, Col, Table, Badge, Button, Spinner, Alert, Modal, Form } from 'react-bootstrap'
import './Monitor.css'

const API_BASE_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_DEVELOPMENT_SERVER_URL || '')
  : (import.meta.env.VITE_PRODUCTION_SERVER_URL || '')

const normalizeBaseUrl = (baseUrl) => {
  if (!baseUrl) return ''
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

const buildApiUrl = (path) => {
  const normalizedBase = normalizeBaseUrl(API_BASE_URL)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
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

/**
 * RegionSelector — click-and-drag a blue rectangle over a screenshot.
 * Supports: draw new region, move region, resize via 8 handles.
 * Region values are 0-1 fractions relative to the image dimensions.
 */
function RegionSelector({ screenshotUrl, region, onChange, onSave, onReset }) {
  const containerRef = useRef(null)
  const imgRef = useRef(null)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })

  // Interaction mode: null | 'draw' | 'move' | handle name
  const mode = useRef(null)
  const startPt = useRef({ x: 0, y: 0 })
  const startRegion = useRef({ ...region })

  // Measure the rendered image dimensions (may differ from natural)
  useEffect(() => {
    const measure = () => {
      const img = imgRef.current
      if (!img) return
      setImgSize({ w: img.clientWidth, h: img.clientHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (imgRef.current) ro.observe(imgRef.current)
    return () => ro.disconnect()
  }, [screenshotUrl])

  // Convert mouse position to 0-1 fraction relative to image
  const toFrac = useCallback((clientX, clientY) => {
    const img = imgRef.current
    if (!img) return { fx: 0, fy: 0 }
    const rect = img.getBoundingClientRect()
    const fx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const fy = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    return { fx, fy }
  }, [])

  const clamp01 = (v) => Math.max(0, Math.min(1, v))

  const onPointerDown = useCallback((e) => {
    // Ignore if not on the image area
    const img = imgRef.current
    if (!img) return
    const rect = img.getBoundingClientRect()
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return

    e.preventDefault()
    containerRef.current?.setPointerCapture(e.pointerId)
    const { fx, fy } = toFrac(e.clientX, e.clientY)
    startPt.current = { x: fx, y: fy }
    startRegion.current = { ...region }

    // Check if we're on a handle
    const handle = e.target.closest('[data-handle]')
    if (handle) {
      mode.current = handle.dataset.handle
      return
    }

    // Check if inside existing region -> move
    if (
      fx >= region.left && fx <= region.left + region.width &&
      fy >= region.top && fy <= region.top + region.height &&
      region.width < 1 && region.height < 1
    ) {
      mode.current = 'move'
      return
    }

    // Otherwise draw a new region
    mode.current = 'draw'
    onChange({ left: fx, top: fy, width: 0, height: 0 })
  }, [region, onChange, toFrac])

  const onPointerMove = useCallback((e) => {
    if (!mode.current) return
    e.preventDefault()
    const { fx, fy } = toFrac(e.clientX, e.clientY)
    const dx = fx - startPt.current.x
    const dy = fy - startPt.current.y
    const sr = startRegion.current

    if (mode.current === 'draw') {
      const left = Math.min(startPt.current.x, fx)
      const top = Math.min(startPt.current.y, fy)
      const width = Math.abs(fx - startPt.current.x)
      const height = Math.abs(fy - startPt.current.y)
      onChange({ left: clamp01(left), top: clamp01(top), width: clamp01(width), height: clamp01(height) })
    } else if (mode.current === 'move') {
      let newLeft = clamp01(sr.left + dx)
      let newTop = clamp01(sr.top + dy)
      if (newLeft + sr.width > 1) newLeft = 1 - sr.width
      if (newTop + sr.height > 1) newTop = 1 - sr.height
      onChange({ ...sr, left: newLeft, top: newTop })
    } else {
      // Handle resize
      const h = mode.current
      let { left, top, width, height } = sr

      if (h.includes('w')) { // west (left edge)
        const newLeft = clamp01(left + dx)
        width = clamp01(left + width - newLeft)
        left = newLeft
      }
      if (h.includes('e')) { // east (right edge)
        width = clamp01(sr.width + dx)
        if (left + width > 1) width = 1 - left
      }
      if (h.includes('n')) { // north (top edge)
        const newTop = clamp01(top + dy)
        height = clamp01(top + height - newTop)
        top = newTop
      }
      if (h.includes('s')) { // south (bottom edge)
        height = clamp01(sr.height + dy)
        if (top + height > 1) height = 1 - top
      }

      if (width < 0.01) width = 0.01
      if (height < 0.01) height = 0.01
      onChange({ left, top, width, height })
    }
  }, [onChange, toFrac])

  const onPointerUp = useCallback((e) => {
    if (!mode.current) return
    containerRef.current?.releasePointerCapture(e.pointerId)
    // If region is tiny after drawing (accidental click), reset to full
    if (mode.current === 'draw' && region.width < 0.02 && region.height < 0.02) {
      onChange({ left: 0, top: 0, width: 1, height: 1 })
    }
    mode.current = null
  }, [region, onChange])

  const isFullPage = region.left === 0 && region.top === 0 && region.width === 1 && region.height === 1

  // Region pixel position on the rendered image
  const rLeft = region.left * imgSize.w
  const rTop = region.top * imgSize.h
  const rW = region.width * imgSize.w
  const rH = region.height * imgSize.h

  // Handle positions (corners + midpoints)
  const handles = [
    { name: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
    { name: 'n',  x: 0.5, y: 0, cursor: 'ns-resize' },
    { name: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
    { name: 'w',  x: 0, y: 0.5, cursor: 'ew-resize' },
    { name: 'e',  x: 1, y: 0.5, cursor: 'ew-resize' },
    { name: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
    { name: 's',  x: 0.5, y: 1, cursor: 'ns-resize' },
    { name: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  ]

  return (
    <div className="region-selector-section">
      <h5 className="region-selector-title">🎯 Monitored Area</h5>
      <p className="region-selector-desc">
        Click and drag on the screenshot to select the region for visual change detection.
        Drag the box to move it, or drag the handles to resize.
        {!isFullPage && (
          <span className="region-selector-info">
            {' '}— Region: {Math.round(region.left * 100)}%, {Math.round(region.top * 100)}% →{' '}
            {Math.round(region.width * 100)}% × {Math.round(region.height * 100)}%
          </span>
        )}
      </p>

      <div
        className="region-selector-container"
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img
          ref={imgRef}
          src={screenshotUrl}
          alt="Screenshot for region selection"
          className="region-selector-img"
          draggable={false}
          onLoad={() => {
            const img = imgRef.current
            if (img) setImgSize({ w: img.clientWidth, h: img.clientHeight })
          }}
        />

        {/* Dark overlay outside the selected region */}
        {!isFullPage && imgSize.w > 0 && (
          <>
            <div className="region-overlay region-overlay-top" style={{ height: rTop }} />
            <div className="region-overlay region-overlay-bottom" style={{ top: rTop + rH, height: imgSize.h - rTop - rH }} />
            <div className="region-overlay region-overlay-left" style={{ top: rTop, height: rH, width: rLeft }} />
            <div className="region-overlay region-overlay-right" style={{ top: rTop, height: rH, left: rLeft + rW, width: imgSize.w - rLeft - rW }} />
          </>
        )}

        {/* Blue selection rectangle */}
        {!isFullPage && imgSize.w > 0 && (
          <div
            className="region-rect"
            style={{ left: rLeft, top: rTop, width: rW, height: rH }}
          >
            {/* Resize handles */}
            {handles.map(h => (
              <div
                key={h.name}
                data-handle={h.name}
                className="region-handle"
                style={{
                  left: `${h.x * 100}%`,
                  top: `${h.y * 100}%`,
                  cursor: h.cursor,
                }}
              />
            ))}
            {/* Size label inside the rectangle */}
            <div className="region-rect-label">
              {Math.round(region.width * 100)}% × {Math.round(region.height * 100)}%
            </div>
          </div>
        )}
      </div>

      <div className="region-selector-actions">
        <Button variant="success" size="sm" onClick={onSave}>
          💾 Save Region
        </Button>
        <Button variant="outline-secondary" size="sm" onClick={onReset}>
          ↩ Reset to Full Page
        </Button>
        {isFullPage && <span className="text-muted small ms-2">Monitoring the full page</span>}
      </div>
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
    changeNotificationsEnabled: false,
  })

  const [region, setRegion] = useState({left: 0, top: 0, width: 1, height: 1});

  // Screenshot viewer state
  const [screenshotTab, setScreenshotTab] = useState('latest')
  // Track when data was last refreshed
  const [lastRefreshed, setLastRefreshed] = useState(null)
  // Selected screenshot index — clicking a thumbnail updates the main view
  // null = show the latest screenshot (default behaviour)
  const [selectedCheckIndex, setSelectedCheckIndex] = useState(null)

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
        changeNotificationsEnabled: detail.site.change_notifications_enabled || false,
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

  useEffect(() => {
    if (site) {
      setRegion({
        left: site.region_left_pct || 0,
        top: site.region_top_pct || 0,
        width: site.region_width_pct || 1,
        height: site.region_height_pct || 1,
      });
    }
  }, [site]);

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

  const resetRegion = () => setRegion({left: 0, top: 0, width: 1, height: 1});

  const saveRegion = async () => {
    try {
      await fetchJson(buildApiUrl(`/api/monitor/${siteId}/settings/`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regionLeftPct: region.left,
          regionTopPct: region.top,
          regionWidthPct: region.width,
          regionHeightPct: region.height,
        }),
      });
      loadSiteData();
    } catch (err) {
      alert('Failed to save region: ' + err.message);
    }
  };

  /* ---- screenshot data ---- */
  const hasScreenshot = !!summary?.last_screenshot_url

  // All logs with a screenshot, ordered newest-first (same as logs)
  const screenshotLogs = logs.filter(l => l.screenshot_url)

  // The currently selected check for the main view.
  // If nothing is explicitly selected, default to the latest (index 0).
  const activeIndex = selectedCheckIndex !== null && selectedCheckIndex < screenshotLogs.length
    ? selectedCheckIndex
    : 0
  const activeCheck = screenshotLogs[activeIndex] || null

  // The "previous" check relative to the active one (next older screenshot).
  const prevCheck = screenshotLogs[activeIndex + 1] || null

  const hasDiff = !!activeCheck?.diff_url

  const selectScreenshot = (log) => {
    const idx = screenshotLogs.findIndex(l => l.id === log.id)
    setSelectedCheckIndex(idx >= 0 ? idx : 0)
  }

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
                        (tab === 'overlay' && !prevCheck) ||
                        (tab === 'side' && !prevCheck)
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

              {!hasScreenshot || !activeCheck ? (
                <div className="chart-placeholder">
                  No screenshots yet. Enable screenshots in Settings and wait for the next check.
                </div>
              ) : (
                <div className="screenshot-content">
                  {/* --- Latest tab --- */}
                  {screenshotTab === 'latest' && (
                    <div className="screenshot-single">
                      <ScreenshotImage
                        src={buildApiUrl(activeCheck.screenshot_url)}
                        alt="Screenshot"
                      />
                      <p className="screenshot-caption">
                        Captured {formatTimestamp(activeCheck.checked_at)}
                        {activeCheck.diff_score !== null && activeCheck.diff_score !== undefined && (
                          <> · {diffScoreBadge(activeCheck.diff_score)}</>
                        )}
                      </p>
                    </div>
                  )}

                  {/* --- Diff tab --- */}
                  {screenshotTab === 'diff' && hasDiff && (
                    <div className="screenshot-single">
                      <div className="diff-score-banner">
                        Change score: <strong>{activeCheck.diff_score ?? 0}%</strong>
                        {diffScoreBadge(activeCheck.diff_score)}
                      </div>
                      <ScreenshotImage
                        src={buildApiUrl(activeCheck.diff_url)}
                        alt="Visual diff"
                        className="diff-img"
                      />
                      <p className="screenshot-caption">
                        Highlighted pixel differences between this check and the previous one.
                        Brighter areas = more change.
                      </p>
                    </div>
                  )}

                  {/* --- Overlay slider tab --- */}
                  {screenshotTab === 'overlay' && prevCheck && (
                    <div className="screenshot-single">
                      <p className="screenshot-caption mb-2" style={{ marginBottom: '0.5rem' }}>
                        Drag the slider to compare previous ↔ selected
                      </p>
                      <OverlaySlider
                        beforeSrc={buildApiUrl(prevCheck.screenshot_url)}
                        afterSrc={buildApiUrl(activeCheck.screenshot_url)}
                        beforeLabel="Previous"
                        afterLabel="Selected"
                      />
                    </div>
                  )}

                  {/* --- Side by side tab --- */}
                  {screenshotTab === 'side' && prevCheck && (
                    <div className="screenshot-side-by-side">
                      <div className="screenshot-panel">
                        <h6>Previous</h6>
                        <ScreenshotImage
                          src={buildApiUrl(prevCheck.screenshot_url)}
                          alt="Previous screenshot"
                          onClick={() => selectScreenshot(prevCheck)}
                        />
                        <p className="screenshot-caption">{formatTimestamp(prevCheck.checked_at)}</p>
                      </div>
                      <div className="screenshot-panel">
                        <h6>Selected</h6>
                        <ScreenshotImage
                          src={buildApiUrl(activeCheck.screenshot_url)}
                          alt="Selected screenshot"
                        />
                        <p className="screenshot-caption">{formatTimestamp(activeCheck.checked_at)}</p>
                      </div>
                    </div>
                  )}

                  {/* --- Thumbnail gallery --- */}
                  {screenshotLogs.length > 0 && <div className="screenshot-gallery">
                      <div className="screenshot-gallery-label">Recent screenshots (click to view)</div>
                      <div className="screenshot-gallery-strip">
                        {screenshotLogs.map((log, idx) => (
                          <button
                            key={log.id}
                            className={`screenshot-thumb-btn ${idx === activeIndex ? 'active' : ''}`}
                            onClick={() => selectScreenshot(log)}
                            title={formatTimestamp(log.checked_at)}
                          >
                            <img
                              src={buildApiUrl(log.screenshot_url)}
                              alt={`Check ${formatTime(log.checked_at)}`}
                              className="screenshot-thumb"
                            />
                            <span className="screenshot-thumb-time">{formatTime(log.checked_at)}</span>
                            {log.diff_score !== null && log.diff_score !== undefined && <span className={`screenshot-thumb-dot ${log.diff_score > 10 ? 'red' : log.diff_score > 0 ? 'yellow' : 'green'}`} /> }
                          </button>
                        ))}
                      </div>
                    </div>}

                  {/* --- Visual-change sparkline --- */}
                  <DiffSparkline history={history} />
                </div>

              )}
                {/* --- Monitored Region Selector --- */}
                {site?.screenshot_enabled && summary?.last_screenshot_url && (
                  <RegionSelector
                    screenshotUrl={buildApiUrl(summary.last_screenshot_url)}
                    region={region}
                    onChange={setRegion}
                    onSave={saveRegion}
                    onReset={resetRegion}
                  />
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
                      <Button size="sm" variant="outline-primary" onClick={() => {
                        selectScreenshot(log)
                        // Scroll to the screenshot section
                        document.querySelector('.screenshot-section')?.scrollIntoView({ behavior: 'smooth' })
                      }}>
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

            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="Notify me when a visual change is detected"
                checked={settingsData.changeNotificationsEnabled}
                disabled={!settingsData.screenshotEnabled}
                onChange={(e) => handleSettingsChange('changeNotificationsEnabled', e.target.checked)}
              />
              <Form.Text className="text-muted">
                {settingsData.screenshotEnabled
                  ? 'Send an email when the visual diff score is greater than 0 (any change detected).'
                  : 'Enable screenshots first to use visual change notifications.'}
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
