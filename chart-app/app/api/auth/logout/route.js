import { cookies } from 'next/headers'
import { db } from '@/lib/db.js'
import { COOKIE, json, sha } from '@/lib/auth.js'

export const runtime = 'nodejs'

export async function POST() {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token))
  jar.delete(COOKIE)
  return json({ ok: true })
}
