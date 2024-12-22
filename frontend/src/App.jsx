import React from 'react'

import {BrowserRouter as Router, Routes, Route} from "react-router-dom"

import 'bootstrap/dist/css/bootstrap.css'

import Home from './pages/Home/Home.jsx'
import './pages/Home/Home.css'

import Monitor from './pages/Monitor/Monitor.jsx'
import Login from './pages/Login/Login.jsx'
import Register from './pages/Register/Register.jsx'
import './App.css'

import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import Admin from './pages/Admin/Admin.jsx'

function App() {
  return (
      <Router>
        <AuthProvider>
          <Routes>
            <Route path='/login' element={ <Login /> } />
            <Route path='/register' element={ <Register /> } />
            <Route path='/' element={ <ProtectedRoute><Home /></ProtectedRoute> } />
            <Route path='/monitor/:siteId' element={ <ProtectedRoute><Monitor /></ProtectedRoute> } />
            <Route path='/monitor' element={ <ProtectedRoute><Monitor /></ProtectedRoute> } />
            <Route path='/admin' element={ <AdminRoute><Admin /></AdminRoute> } />
          </Routes>
        </AuthProvider>
      </Router>
  )
}

export default App