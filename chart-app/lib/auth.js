import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from './db.js'

export const COOKIE = 'sid'
export const SESSION_DAYS = 7
export const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name })
export const json = (body, status = 200) => NextResponse.json(body, { status })

const secure = () => process.env.COOKIE_SECURE === 'true'

// One active session per account: a new login signs out every other device.
export async function startSession(userId) {
  db.prepare("UPDATE sessions SET revoked_reason = 'other_device' WHERE user_id = ? AND revoked_reason IS NULL").run(userId)
  const token = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha(token), userId, Date.now() + SESSION_DAYS * 864e5)
  ;(await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: secure(), maxAge: SESSION_DAYS * 86400, path: '/' })
}

// -> { user } for a valid session, otherwise { reason } ('other_device' | 'none').
export async function sessionStatus() {
  const token = (await cookies()).get(COOKIE)?.value
  if (!token) return { reason: 'none' }
  const row = db.prepare('SELECT u.*, s.expires_at, s.revoked_reason FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').get(sha(token))
  if (!row) return { reason: 'none' }
  if (row.expires_at < Date.now()) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token)); return { reason: 'none' } }
  if (row.revoked_reason) return { reason: row.revoked_reason }
  return { user: row }
}

// Simple in-memory limiter: 30 attempts / 15 min per client address.
const hits = (globalThis.__authHits ??= new Map())
export function limited(request) {
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local'
  const now = Date.now()
  const rec = hits.get(ip)
  if (!rec || rec.reset < now) { hits.set(ip, { n: 1, reset: now + 15 * 60 * 1000 }); return false }
  rec.n += 1
  return rec.n > 30
}
