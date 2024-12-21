import React from 'react'
import { Container, Card } from 'react-bootstrap'

export default function Admin() {
  return (
    <Container style={{ maxWidth: 900, marginTop: 24 }}>
      <Card>
        <Card.Body>
          <h2>Admin Dashboard</h2>
          <p>This page is only visible to admin users.</p>
        </Card.Body>
      </Card>
    </Container>
  )
}

