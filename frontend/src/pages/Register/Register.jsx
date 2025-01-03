import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Form, Button, Container, Card, Alert } from 'react-bootstrap'
import './Register.css'

function Register() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const validateForm = () => {
    if (!formData.username || !formData.email || !formData.password || !formData.confirmPassword) {
      setError('Please fill in all fields')
      return false
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return false
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long')
      return false
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address')
      return false
    }

    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      setError('')
      setLoading(true)

      // Call backend API for registration
      const response = await fetch(
        import.meta.env.DEV
          ? (import.meta.env.VITE_DEVELOPMENT_SERVER_URL || '') + '/api/auth/register/'
          : (import.meta.env.VITE_PRODUCTION_SERVER_URL || '') + '/api/auth/register/',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            username: formData.username,
            email: formData.email,
            password: formData.password,
          }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const msg = errorData.error || errorData.message || 'Registration failed'
        const detail = errorData.details ? ` (${errorData.details})` : ''
        throw new Error(msg + detail)
      }

      const data = await response.json()
      console.log('Registration successful:', data)

      // Redirect to login page after successful registration
      navigate('/login', {
        state: { message: 'Registration successful! Please log in.' },
      })
    } catch (err) {
      setError(err.message || 'Failed to register. Please try again.')
      console.error('Registration error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container className="register-container">
      <Card className="register-card">
        <Card.Body>
          <div className="app-title">
            <div className="app-icon">
              📊
            </div>
            <h2>Create Account</h2>
            <p className="register-subtitle">Join Website Monitor today</p>
          </div>

          {error && (
            <Alert variant="danger" className="register-alert">
              {error}
            </Alert>
          )}

          <Form onSubmit={handleSubmit} className="register-form">
            <Form.Group className="mb-3" controlId="username">
              <Form.Label>Username</Form.Label>
              <Form.Control
                type="text"
                name="username"
                placeholder="Choose a username"
                value={formData.username}
                onChange={handleChange}
                disabled={loading}
                required
                autoFocus
              />
            </Form.Group>

            <Form.Group className="mb-3" controlId="email">
              <Form.Label>Email Address</Form.Label>
              <Form.Control
                type="email"
                name="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3" controlId="password">
              <Form.Label>Password</Form.Label>
              <Form.Control
                type="password"
                name="password"
                placeholder="Create a password"
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
                required
              />
              <Form.Text className="text-muted">
                Must be at least 6 characters long
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3" controlId="confirmPassword">
              <Form.Label>Confirm Password</Form.Label>
              <Form.Control
                type="password"
                name="confirmPassword"
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChange={handleChange}
                disabled={loading}
                required
              />
            </Form.Group>

            <Button
              variant="primary"
              type="submit"
              className="w-100 register-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  ></span>
                  Creating Account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </Form>

          <div className="register-footer">
            <p className="text-center mt-3 mb-0">
              Already have an account?{' '}
              <Link to="/login" className="register-link">
                Login here
              </Link>
            </p>
          </div>
        </Card.Body>
      </Card>
    </Container>
  )
}

export default Register
