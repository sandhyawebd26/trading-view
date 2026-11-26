import React, { useEffect, useState } from 'react'
import AuthPage from './AuthPage.jsx'
import ChartPage from './ChartPage.jsx'
import { logout, me } from './api.js'

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = checking session, null = signed out

  useEffect(() => {
    me().then((r) => setUser(r?.user ?? null)).catch(() => setUser(null))
  }, [])

  if (user === undefined) return <div className="boot">Loading…</div>
  if (!user) return <AuthPage onAuth={setUser} />
  return <ChartPage user={user} onLogout={() => logout().finally(() => setUser(null))} />
}
