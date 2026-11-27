import bcrypt from 'bcryptjs'
import { db } from '@/lib/db.js'
import { json, limited, publicUser, startSession } from '@/lib/auth.js'

export const runtime = 'nodejs'
// Dummy hash so login timing doesn't reveal whether an email exists.
const DUMMY = bcrypt.hashSync('not-a-real-password', 12)

export async function POST(request) {
  if (limited(request)) return json({ error: 'Too many attempts. Try again later.' }, 429)
  const body = await request.json().catch(() => ({}))
  const email = String(body?.email ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY)
  if (!user || !ok) return json({ error: 'Incorrect email or password.' }, 401)
  await startSession(user.id)
  return json({ user: publicUser(user) })
}
