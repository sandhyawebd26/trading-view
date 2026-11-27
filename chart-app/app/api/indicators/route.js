import { db } from '@/lib/db.js'
import { json, sessionStatus } from '@/lib/auth.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PER_USER = 50
const MAX_SOURCE = 50_000 // characters

// A user's own saved Pine indicators, newest edit first. Scripts only ever run for the user who saved them.
export async function GET() {
  const { user } = await sessionStatus()
  if (!user) return json({ error: 'Not signed in.' }, 401)
  const rows = db.prepare('SELECT id, name, source, updated_at AS updatedAt FROM indicators WHERE user_id = ? ORDER BY updated_at DESC, id DESC').all(user.id)
  return json({ indicators: rows })
}

// Save a script under a name. Saving the same name again replaces that indicator.
export async function POST(request) {
  const { user } = await sessionStatus()
  if (!user) return json({ error: 'Not signed in.' }, 401)
  const body = await request.json().catch(() => ({}))
  const name = String(body?.name ?? '').trim()
  const source = String(body?.source ?? '')
  if (name.length < 1 || name.length > 80) return json({ error: 'Enter a name up to 80 characters.' }, 400)
  if (!source.trim()) return json({ error: 'The script is empty.' }, 400)
  if (source.length > MAX_SOURCE) return json({ error: 'The script is too long to save (limit 50,000 characters).' }, 413)

  const existing = db.prepare('SELECT id FROM indicators WHERE user_id = ? AND name = ?').get(user.id, name)
  if (existing) {
    db.prepare("UPDATE indicators SET source = ?, updated_at = datetime('now') WHERE id = ?").run(source, existing.id)
    return json({ indicator: { id: existing.id, name, source }, replaced: true })
  }
  const count = db.prepare('SELECT COUNT(*) n FROM indicators WHERE user_id = ?').get(user.id).n
  if (count >= MAX_PER_USER) return json({ error: `You can save up to ${MAX_PER_USER} indicators. Delete one first.` }, 409)
  const info = db.prepare('INSERT INTO indicators (user_id, name, source) VALUES (?,?,?)').run(user.id, name, source)
  return json({ indicator: { id: Number(info.lastInsertRowid), name, source }, replaced: false }, 201)
}
