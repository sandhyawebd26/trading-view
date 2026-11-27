import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const dbPath = path.resolve(process.env.DB_PATH || path.join(process.cwd(), 'data', 'app.db'))

// One connection per server process (survives Next dev hot reloads).
const g = globalThis
if (!g.__chartDb) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  g.__chartDb = new Database(dbPath)
  g.__chartDb.pragma('journal_mode = WAL')
}
export const db = g.__chartDb
// Tables are created if missing every time this module loads, so adding a table never needs a manual step.
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
);
CREATE TABLE IF NOT EXISTS indicators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name)
);`)
