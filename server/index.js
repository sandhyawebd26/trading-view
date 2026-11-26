import express from 'express'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || process.env.API_PORT || 4317)
const HOST = process.env.HOST || '0.0.0.0'
const SESSION_DAYS = 7
const COOKIE = 'sid'

const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db'))
fs.mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);`)

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name })

const isSecureCookie = (req) => process.env.COOKIE_SECURE === 'true' || req.secure

function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = Date.now() + SESSION_DAYS * 864e5
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha(token), userId, expires)
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: isSecureCookie(req), maxAge: SESSION_DAYS * 864e5, path: '/',
  })
}

function currentUser(req) {
  const token = req.cookies[COOKIE]
  if (!token) return null
  const row = db.prepare(
    'SELECT u.* , s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
  ).get(sha(token))
  if (!row) return null
  if (row.expires_at < Date.now()) { db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token)); return null }
  return row
}

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(express.json({ limit: '10kb' }))
app.use(cookieParser())

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' } })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Dummy hash so login timing doesn't reveal whether an email exists.
const DUMMY = bcrypt.hashSync('not-a-real-password', 12)

app.post('/api/auth/signup', limiter, async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const name = String(req.body?.name ?? '').trim()
  const password = String(req.body?.password ?? '')
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' })
  if (name.length < 1 || name.length > 80) return res.status(400).json({ error: 'Enter your name.' })
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must be 8–128 characters.' })
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'An account with this email already exists.' })
  const hash = await bcrypt.hash(password, 12)
  const info = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)').run(email, name, hash)
  startSession(req, res, info.lastInsertRowid)
  res.status(201).json({ user: { id: Number(info.lastInsertRowid), email, name } })
})

app.post('/api/auth/login', limiter, async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY)
  if (!user || !ok) return res.status(401).json({ error: 'Incorrect email or password.' })
  startSession(req, res, user.id)
  res.json({ user: publicUser(user) })
})

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies[COOKIE]
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token))
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: isSecureCookie(req), path: '/' })
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => {
  const user = currentUser(req)
  if (!user) return res.status(401).json({ error: 'Not signed in.' })
  res.json({ user: publicUser(user) })
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' })
})

const distDir = path.resolve(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

// Periodic cleanup of expired sessions.
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()), 3600e3).unref()

app.listen(PORT, HOST, () => console.log(`Server listening on http://${HOST}:${PORT}`))
