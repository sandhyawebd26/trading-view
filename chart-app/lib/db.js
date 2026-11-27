import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const dbPath = path.resolve(process.env.DB_PATH || path.join(process.cwd(), 'data', 'app.db'))

// One connection per server process (survives Next dev hot reloads).
const g = globalThis
if (!g.__chartDb) {
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
  expires_at INTEGER NOT NULL,
  revoked_reason TEXT
);`)
  g.__chartDb = db
}
export const db = g.__chartDb
