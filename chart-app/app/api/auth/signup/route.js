import bcrypt from 'bcryptjs'
import { db } from '@/lib/db.js'
import { json, limited, startSession } from '@/lib/auth.js'

export const runtime = 'nodejs'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request) {
  if (limited(request)) return json({ error: 'Too many attempts. Try again later.' }, 429)
  const body = await request.json().catch(() => ({}))
  const email = String(body?.email ?? '').trim().toLowerCase()
  const name = String(body?.name ?? '').trim()
  const password = String(body?.password ?? '')
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: 'Enter a valid email address.' }, 400)
  if (name.length < 1 || name.length > 80) return json({ error: 'Enter your name.' }, 400)
  if (password.length < 8 || password.length > 128) return json({ error: 'Password must be 8–128 characters.' }, 400)
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return json({ error: 'An account with this email already exists.' }, 409)
  const hash = await bcrypt.hash(password, 12)
  const info = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)').run(email, name, hash)
  await startSession(info.lastInsertRowid)
  return json({ user: { id: Number(info.lastInsertRowid), email, name } }, 201)
}
