import { db } from '@/lib/db.js'
import { json, sessionStatus } from '@/lib/auth.js'

export const runtime = 'nodejs'

export async function DELETE(_request, { params }) {
  const { user } = await sessionStatus()
  if (!user) return json({ error: 'Not signed in.' }, 401)
  const { id } = await params
  // The user_id check means nobody can delete another account's indicator.
  const info = db.prepare('DELETE FROM indicators WHERE id = ? AND user_id = ?').run(Number(id), user.id)
  if (!info.changes) return json({ error: 'Indicator not found.' }, 404)
  return json({ ok: true })
}
