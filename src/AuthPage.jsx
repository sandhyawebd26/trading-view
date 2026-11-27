import React, { useState } from 'react'
import { login, signup } from './api.js'

export default function AuthPage({ onAuth, notice }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isSignup = mode === 'signup'
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

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

  return (
    <div className="auth">
      <form className="card" onSubmit={submit}>
        <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        {notice && <div className="notice" role="status">{notice}</div>}
        <p className="muted">{isSignup ? 'Sign up to open the live chart.' : 'Sign in to open the live chart.'}</p>
        {isSignup && (
          <label>Name
            <input value={form.name} onChange={set('name')} autoComplete="name" required maxLength={80} />
          </label>
        )}
        <label>Email
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
        </label>
        <label>Password
          <input type="password" value={form.password} onChange={set('password')}
            autoComplete={isSignup ? 'new-password' : 'current-password'} required minLength={isSignup ? 8 : 1} maxLength={128} />
          {isSignup && <span className="hint">At least 8 characters.</span>}
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button type="submit" disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Sign in'}</button>
        <p className="muted switch">
          {isSignup ? 'Already have an account?' : 'New here?'}{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); setError(''); setMode(isSignup ? 'login' : 'signup') }}>
            {isSignup ? 'Sign in' : 'Create an account'}
          </a>
        </p>
      </form>
    </div>
  )
}
