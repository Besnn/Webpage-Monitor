import React, { useState } from 'react'
import { Container, Card, Form, Button, Row, Col, ListGroup, Spinner, Alert, Table, Badge } from 'react-bootstrap'
import './Admin.css'

const API_BASE_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_DEVELOPMENT_SERVER_URL || '')
  : (import.meta.env.VITE_PRODUCTION_SERVER_URL || '')

const normalizeBaseUrl = (baseUrl) => {
  if (!baseUrl) return ''
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

const buildApiUrl = (path) => {
  const normalizedBase = normalizeBaseUrl(API_BASE_URL)
  return `${normalizedBase}${path.startsWith('/') ? path : `/${path}`}`
}

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, { credentials: 'include', ...options })
  let data = null
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

export default function Admin() {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [sitesByUser, setSitesByUser] = useState({})
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [sitesError, setSitesError] = useState('')
  const [sitesLoadingId, setSitesLoadingId] = useState(null)

  const handleSearch = async (event) => {
    event.preventDefault()
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      setSearchError('Enter an email or username to search.')
      setUsers([])
      setSelectedUserId(null)
      return
    }

    setIsSearching(true)
    setSearchError('')
    setSitesError('')
    setUsers([])
    setSelectedUserId(null)

    try {
      const data = await fetchJson(
        buildApiUrl(`/api/admin/users/?query=${encodeURIComponent(trimmedQuery)}`)
      )
      const results = Array.isArray(data.users) ? data.users : []
      setUsers(results)
      if (results.length === 1) {
        const userId = String(results[0].id)
        setSelectedUserId(userId)
        await loadUserSites(userId)
      }
    } catch (error) {
      setSearchError(error.message || 'Unable to search users.')
    } finally {
      setIsSearching(false)
    }
  }

  const loadUserSites = async (userId) => {
    if (sitesByUser[userId]) {
      return
    }

    setSitesLoadingId(userId)
    setSitesError('')
    try {
      const data = await fetchJson(buildApiUrl(`/api/admin/users/${userId}/sites/`))
      const sites = Array.isArray(data.sites) ? data.sites : Array.isArray(data.pages) ? data.pages : []
      setSitesByUser((prev) => ({ ...prev, [userId]: sites }))
    } catch (error) {
      setSitesError(error.message || 'Unable to load monitored sites.')
    } finally {
      setSitesLoadingId(null)
    }
  }

  const handleSelectUser = async (userId) => {
    setSelectedUserId(userId)
    setSitesError('')
    await loadUserSites(userId)
  }

  const selectedSites = selectedUserId ? sitesByUser[selectedUserId] || [] : []

  return (
    <Container className="admin-page" style={{ maxWidth: 1100 }}>
      <Card>
        <Card.Body>
          <h2>Admin Dashboard</h2>
          <p>Search for a user by email or username and review their monitored sites.</p>

          <Form className="admin-search-form" onSubmit={handleSearch}>
            <Form.Group className="flex-grow-1">
              <Form.Label>Search users</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter email or username"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </Form.Group>
            <div className="admin-search-actions">
              <Button type="submit" disabled={isSearching}>
                {isSearching ? 'Searching...' : 'Search'}
              </Button>
            </div>
          </Form>

          {searchError && (
            <Alert className="mt-3" variant="danger">
              {searchError}
            </Alert>
          )}

          <Row className="admin-results">
            <Col md={5}>
              <h5 className="admin-section-title">Users</h5>
              {isSearching && (
                <div className="admin-loading">
                  <Spinner size="sm" animation="border" />
                  <span>Loading results...</span>
                </div>
              )}
              {!isSearching && users.length === 0 && (
                <div className="admin-empty">No users found yet.</div>
              )}
              <ListGroup className="admin-user-list">
                {users.map((user) => {
                  const userId = String(user.id)
                  const isActive = selectedUserId === userId
                  return (
                    <ListGroup.Item
                      key={userId}
                      action
                      active={isActive}
                      onClick={() => handleSelectUser(userId)}
                    >
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="admin-user-name">{user.full_name || user.username || 'Unnamed user'}</div>
                        {user.is_staff && <Badge bg="info" className="ms-2">Admin</Badge>}
                      </div>
                      <div className="admin-user-meta">
                        <span>{user.email || 'No email'}</span>
                        {user.monitored_sites_count !== undefined && (
                          <span className="admin-user-count">
                            {user.monitored_sites_count} sites
                          </span>
                        )}
                      </div>
                      <div className="admin-user-meta mt-1">
                        <small>Joined: {user.date_joined ? new Date(user.date_joined).toLocaleDateString() : 'Unknown'}</small>
                        {!user.is_active && <Badge bg="secondary">Inactive</Badge>}
                      </div>
                    </ListGroup.Item>
                  )
                })}
              </ListGroup>
            </Col>
            <Col md={7}>
              <h5 className="admin-section-title">Monitored sites</h5>
              {!selectedUserId && <div className="admin-empty">Select a user to view their sites.</div>}
              {sitesError && (
                <Alert className="mt-2" variant="danger">
                  {sitesError}
                </Alert>
              )}
              {selectedUserId && sitesLoadingId === selectedUserId && (
                <div className="admin-loading">
                  <Spinner size="sm" animation="border" />
                  <span>Loading monitored sites...</span>
                </div>
              )}
              {selectedUserId && sitesLoadingId !== selectedUserId && (
                <div className="admin-sites">
                  {selectedSites.length === 0 ? (
                    <div className="admin-empty">No monitored sites for this user.</div>
                  ) : (
                    <Table striped bordered hover size="sm" className="admin-sites-table">
                      <thead>
                        <tr>
                          <th>URL</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSites.map((site) => (
                          <tr key={site.id || site.url}>
                            <td>{site.url}</td>
                            <td>{site.created_at ? new Date(site.created_at).toLocaleString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </div>
              )}
            </Col>
          </Row>
        </Card.Body>
      </Card>
    </Container>
  )
}
