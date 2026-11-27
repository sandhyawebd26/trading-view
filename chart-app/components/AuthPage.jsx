'use client'

import React, { useEffect, useRef, useState } from 'react'
import { login, signup } from '@/lib/api.js'
import AuthArt from './AuthArt.jsx'

const MODES = [
  { id: 'login', label: 'Sign in' },
  { id: 'signup', label: 'Create account' },
]

function setTheme(t) {
  document.documentElement.dataset.theme = t
  try { localStorage.setItem('chart-theme', t) } catch { /* ignore */ }
}

export default function AuthPage({ onAuth, notice }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)
  const [theme, setThemeState] = useState('dark')
  const firstField = useRef(null)
  const isSignup = mode === 'signup'
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  useEffect(() => { setThemeState(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark') }, [])
  useEffect(() => { firstField.current?.focus() }, [mode])

  function pick(m) {
    if (m === mode) return
    setError('')
    setMode(m)
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { user } = await (isSignup ? signup(form) : login(form))
      onAuth(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function onTabKey(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    pick(mode === 'login' ? 'signup' : 'login')
  }

  const longEnough = form.password.length >= 8

  return (
    <div className="authx">
      <div className="authx-stage">
        <AuthArt />
        <div className="authx-pitch">
          <p className="authx-brand">Live Chart</p>
          <h2>Candlesticks, drawing tools and your own Pine scripts, live from Binance.</h2>
        </div>
      </div>

      <main className="authx-panel">
        <button type="button" className="authx-theme" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => { const t = theme === 'dark' ? 'light' : 'dark'; setTheme(t); setThemeState(t) }}>
          {theme === 'dark' ? '☀' : '☾'}
        </button>

        <form className="authx-form" onSubmit={submit} noValidate={false}>
          <div className="authx-tabs" role="tablist" aria-label="Account" onKeyDown={onTabKey}>
            {MODES.map((m) => (
              <button key={m.id} type="button" role="tab" id={`tab-${m.id}`} aria-selected={mode === m.id} tabIndex={mode === m.id ? 0 : -1}
                className={mode === m.id ? 'on' : ''} onClick={() => pick(m.id)}>{m.label}</button>
            ))}
          </div>

          <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="authx-sub">{isSignup ? 'Set up your workspace.' : 'Open your charts.'}</p>

          {notice && <div className="authx-notice" role="status">{notice}</div>}

          {isSignup && (
            <label className="authx-field">
              <span>Name</span>
              <input ref={firstField} value={form.name} onChange={set('name')} autoComplete="name" required maxLength={80} />
            </label>
          )}
          <label className="authx-field">
            <span>Email</span>
            <input ref={isSignup ? null : firstField} type="email" value={form.email} onChange={set('email')} autoComplete="email" required placeholder="you@example.com" />
          </label>
          <label className="authx-field">
            <span>Password</span>
            <div className="authx-pass">
              <input type={show ? 'text' : 'password'} value={form.password} onChange={set('password')}
                autoComplete={isSignup ? 'new-password' : 'current-password'} required minLength={isSignup ? 8 : 1} maxLength={128} />
              <button type="button" className="authx-eye" onClick={() => setShow((s) => !s)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
            </div>
            {isSignup && (
              <em className={`authx-rule${longEnough ? ' ok' : ''}`}>{longEnough ? '✓ ' : ''}At least 8 characters</em>
            )}
          </label>

          <div className="authx-error" role="alert" aria-live="assertive">{error}</div>

          <button type="submit" className="authx-submit" disabled={busy}>
            {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  )
}
