import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import './Settings.css'

const SERVER_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_DEVELOPMENT_SERVER_URL || '')
  : (import.meta.env.VITE_PRODUCTION_SERVER_URL || '')

const api = (path, opts = {}) =>
  fetch(`${SERVER_URL}${path}`, { credentials: 'include', ...opts })

// ── small reusable alert ──────────────────────────────────────────────────────
function Alert({ type, msg }) {
  if (!msg) return null
  return <div className={`settings-alert settings-alert--${type}`}>{msg}</div>
}

// ── section card ─────────────────────────────────────────────────────────────
function Card({ title, children }) {
  return (
    <section className="settings-card">
      <h2 className="settings-card-title">{title}</h2>
      {children}
    </section>
  )
}

export default function Settings() {
  const { currentUser, logout, refreshUser } = useAuth()
  const navigate = useNavigate()

  // ── Profile ────────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState({
    username: currentUser?.username || currentUser?.full_name || '',
    email: currentUser?.email || '',
  })
  const [profileStatus, setProfileStatus] = useState({ type: '', msg: '' })
  const [profileBusy, setProfileBusy] = useState(false)

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setProfileBusy(true)
    setProfileStatus({ type: '', msg: '' })
    try {
      const res = await api('/api/auth/me/update/', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: profile.username, email: profile.email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      await refreshUser()
      setProfileStatus({ type: 'success', msg: 'Profile updated.' })
    } catch (err) {
      setProfileStatus({ type: 'error', msg: err.message })
    } finally {
      setProfileBusy(false)
    }
  }

  // ── Password ───────────────────────────────────────────────────────────────
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwStatus, setPwStatus] = useState({ type: '', msg: '' })
  const [pwBusy, setPwBusy] = useState(false)

  const handlePasswordSave = async (e) => {
    e.preventDefault()
    setPwStatus({ type: '', msg: '' })
    if (pw.next !== pw.confirm)
      return setPwStatus({ type: 'error', msg: 'New passwords do not match.' })
    if (pw.next.length < 8)
      return setPwStatus({ type: 'error', msg: 'Password must be at least 8 characters.' })
    setPwBusy(true)
    try {
      const res = await api('/api/auth/me/change-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: pw.current, new_password: pw.next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Password change failed')
      setPw({ current: '', next: '', confirm: '' })
      setPwStatus({ type: 'success', msg: 'Password changed successfully.' })
    } catch (err) {
      setPwStatus({ type: 'error', msg: err.message })
    } finally {
      setPwBusy(false)
    }
  }

  // ── Delete account ─────────────────────────────────────────────────────────
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteStatus, setDeleteStatus] = useState({ type: '', msg: '' })
  const [deleteBusy, setDeleteBusy] = useState(false)

  const handleDelete = async (e) => {
    e.preventDefault()
    if (!deleteConfirm) return setDeleteStatus({ type: 'error', msg: 'Please tick the confirmation box.' })
    setDeleteBusy(true)
    setDeleteStatus({ type: '', msg: '' })
    try {
      const res = await api('/api/auth/me/delete/', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Deletion failed')
      logout()
    } catch (err) {
      setDeleteStatus({ type: 'error', msg: err.message })
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="settings-back" onClick={() => navigate('/')}>← Back</button>
        <h1 className="settings-title">Account Settings</h1>
        <p className="settings-sub">Manage your profile, security, and account data.</p>
      </div>

      <div className="settings-body">

        {/* ── Profile ─────────────────────────────────────────── */}
        <Card title="👤 Profile">
          <form onSubmit={handleProfileSave} className="settings-form">
            <label className="settings-label">
              Username
              <input
                className="settings-input"
                value={profile.username}
                onChange={e => setProfile(p => ({ ...p, username: e.target.value }))}
                autoComplete="username"
              />
            </label>
            <label className="settings-label">
              Email address
              <input
                type="email"
                className="settings-input"
                value={profile.email}
                onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                autoComplete="email"
              />
            </label>
            <Alert {...profileStatus} />
            <button className="settings-btn" disabled={profileBusy}>
              {profileBusy ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </Card>

        {/* ── Password ────────────────────────────────────────── */}
        <Card title="🔒 Change Password">
          <form onSubmit={handlePasswordSave} className="settings-form">
            <label className="settings-label">
              Current password
              <input
                type="password"
                className="settings-input"
                value={pw.current}
                onChange={e => setPw(p => ({ ...p, current: e.target.value }))}
                autoComplete="current-password"
              />
            </label>
            <label className="settings-label">
              New password
              <input
                type="password"
                className="settings-input"
                value={pw.next}
                onChange={e => setPw(p => ({ ...p, next: e.target.value }))}
                autoComplete="new-password"
              />
            </label>
            <label className="settings-label">
              Confirm new password
              <input
                type="password"
                className="settings-input"
                value={pw.confirm}
                onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
                autoComplete="new-password"
              />
            </label>
            <Alert {...pwStatus} />
            <button className="settings-btn" disabled={pwBusy}>
              {pwBusy ? 'Changing…' : 'Change password'}
            </button>
          </form>
        </Card>

        {/* ── Account info ─────────────────────────────────────── */}
        <Card title="ℹ️ Account Info">
          <dl className="settings-info-list">
            <dt>User ID</dt><dd>{currentUser?.id}</dd>
            <dt>Role</dt><dd className="settings-role-badge">{currentUser?.role || 'user'}</dd>
          </dl>
        </Card>

        {/* ── Danger zone ──────────────────────────────────────── */}
        <Card title="⚠️ Danger Zone">
          <p className="settings-danger-desc">
            Permanently delete your account and all monitored sites, checks, and screenshots.
            This cannot be undone.
          </p>
          <form onSubmit={handleDelete} className="settings-form">
            <label className="settings-label">
              Confirm your password
              <input
                type="password"
                className="settings-input settings-input--danger"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                placeholder="Enter your password to confirm"
              />
            </label>
            <label className="settings-checkbox-label">
              <input
                type="checkbox"
                checked={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.checked)}
              />
              I understand this is permanent and cannot be undone
            </label>
            <Alert {...deleteStatus} />
            <button className="settings-btn settings-btn--danger" disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete my account'}
            </button>
          </form>
        </Card>

      </div>
    </div>
  )
}

