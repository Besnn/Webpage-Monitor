import React, {useEffect, useState} from 'react'

import {BrowserRouter as Router, Routes, Route, Link, useNavigate} from "react-router-dom"
import Button from 'react-bootstrap/Button'

import 'bootstrap/dist/css/bootstrap.css'

import Home from './pages/Home/Home.jsx'
import './pages/Home/Home.css'

import Monitor from './pages/Monitor/Monitor.jsx'
import Login from './pages/Login/Login.jsx'
import './App.css'

import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
      <Router>
        <AuthProvider>
          <Routes>
            <Route path='/login' element={ <Login /> } />
            <Route path='/' element={ <ProtectedRoute><Home /></ProtectedRoute> } />
            <Route path='/monitor' element={ <ProtectedRoute><Monitor /></ProtectedRoute> } />
          </Routes>
        </AuthProvider>
      </Router>
  )
}

export default App