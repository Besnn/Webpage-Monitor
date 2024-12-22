import React, { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Form, Button, Container, Card, Alert } from 'react-bootstrap'
import { useAuth } from '../../context/AuthContext'
import './Login.css'

function Login() {
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState(location.state?.message || '')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!username || !password) {
      setError('Please enter username or email and password')
      return
    }

    try {
      setError('')
      setLoading(true)
      // Call the login function from AuthContext (sends username or email as the username field)
      await login(username, password)
      // Redirect to home page after successful login
      navigate('/')
    } catch (err) {
      setError(err.message || 'Failed to log in. Please check your credentials.')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container className="login-container">
      <Card className="login-card">
        <Card.Body>
          <div className="app-title">
            <div className="app-icon">
              📊
            </div>
            <h2>Website Monitor</h2>
            <p className="login-subtitle">Monitor your webpages with ease</p>
          </div>
          {successMessage && <Alert variant="success" className="login-alert" onClose={() => setSuccessMessage('')} dismissible>{successMessage}</Alert>}
          {error && <Alert variant="danger" className="login-alert">{error}</Alert>}
          <Form onSubmit={handleSubmit} className="login-form">
            <Form.Group className="mb-3" controlId="username">
              <Form.Label>Username or email</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter your username or email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                required
                autoFocus
              />
            </Form.Group>

            <Form.Group className="mb-3" controlId="password">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </Form.Group>

            <Button
              variant="primary"
              type="submit"
              className="w-100 login-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </Button>
          </Form>

          <div className="login-footer">
            <p className="text-center mt-3 mb-0">
              Don't have an account?{' '}
              <Link to="/register" className="register-link">
                Register here
              </Link>
            </p>
          </div>
        </Card.Body>
      </Card>
    </Container>
  )
}

export default Login
