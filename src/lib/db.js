import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Determine database path from environment or default to project data folder
const dbPath = process.env.DB_PATH || join(__dirname, '../../data/aliases.db');

// Ensure the directory exists
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Initialise tables if they do not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT UNIQUE NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    last_sender TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Ensure wildcard setting exists
const wildcardSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('wildcard_enabled');
if (!wildcardSetting) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('wildcard_enabled', 'true');
}

export function allAliases() {
  return db.prepare('SELECT * FROM aliases ORDER BY created_at DESC').all();
}

export function getAlias(alias) {
  return db.prepare('SELECT * FROM aliases WHERE alias = ?').get(alias);
}

export function createAlias(alias, last_sender = null, notes = '') {
  console.log('createAlias called with:', { alias, last_sender, notes });
  
  try {
    const stmt = db.prepare('INSERT OR IGNORE INTO aliases (alias, enabled, notes, last_sender, created_at) VALUES (?, 1, ?, ?, CURRENT_TIMESTAMP)');
    const info = stmt.run(alias, notes, last_sender);
    console.log('Database insert result:', info);
    
    const success = info.changes > 0;
    console.log('Alias creation success:', success);
    
    return success;
  } catch (error) {
    console.error('Error in createAlias:', error);
    return false;
  }
}

export function blockAlias(alias) {
  return db.prepare('UPDATE aliases SET enabled = 0 WHERE alias = ?').run(alias).changes > 0;
}

export function unblockAlias(alias) {
  return db.prepare('UPDATE aliases SET enabled = 1 WHERE alias = ?').run(alias).changes > 0;
}

export function deleteAlias(alias) {
  return db.prepare('DELETE FROM aliases WHERE alias = ?').run(alias).changes > 0;
}

export function updateLastSender(alias, sender) {
  return db.prepare('UPDATE aliases SET last_sender = ?, last_used_at = CURRENT_TIMESTAMP WHERE alias = ?').run(sender, alias).changes > 0;
}

export function updateAliasNote(alias, note) {
  try {
    console.log('updateAliasNote called with:', { alias, note });
    const stmt = db.prepare('UPDATE aliases SET notes = ? WHERE alias = ?');
    const info = stmt.run(note, alias);
    console.log('Note update result:', info);
    return info.changes > 0;
  } catch (error) {
    console.error('Error in updateAliasNote:', error);
    return false;
  }
}

export function getWildcardEnabled() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('wildcard_enabled');
  return row ? row.value === 'true' : true;
}

export function setWildcardEnabled(value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('wildcard_enabled', value ? 'true' : 'false');
}