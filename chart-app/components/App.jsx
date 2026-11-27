'use client'

import React, { useCallback, useEffect, useState } from 'react'
import AuthPage from './AuthPage.jsx'
import dynamic from 'next/dynamic'
const ChartPage = dynamic(() => import('./ChartPage.jsx'), { ssr: false, loading: () => <div className="boot">Loading chart…</div> })
import { logout, me } from '@/lib/api.js'

const CHECK_EVERY_MS = 15000

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = checking session, null = signed out
  const [notice, setNotice] = useState('')

  const check = useCallback(async () => {
    try {
      const r = await me()
      setUser((u) => (u && u.id === r.user.id ? u : r.user))
    } catch (e) {
      if (e.status === 401) {
        setUser((u) => {
          if (u && e.reason === 'other_device') setNotice(e.message)
          return null
        })
      }
      // Network / server errors: keep the current state rather than signing the user out.
    }
  }, [])

  useEffect(() => { check() }, [check])

  // While signed in, notice a login from another device soon after it happens.
  useEffect(() => {
    if (!user) return
    const id = setInterval(check, CHECK_EVERY_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', check) }
  }, [user, check])

  if (user === undefined) return <div className="boot">Loading…</div>
  if (!user) return <AuthPage notice={notice} onAuth={(u) => { setNotice(''); setUser(u) }} />
  return <ChartPage user={user} onLogout={() => logout().finally(() => { setNotice(''); setUser(null) })} />
}
