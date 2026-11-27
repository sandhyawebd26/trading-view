import { json, publicUser, sessionStatus } from '@/lib/auth.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { user, reason } = await sessionStatus()
  if (!user) {
    return json({
      reason,
      error: reason === 'other_device' ? 'You were signed out because your account was signed in on another device.' : 'Not signed in.',
    }, 401)
  }
  return json({ user: publicUser(user) })
}
