/**
 * SQLite para User KB: (owner_user_id, source_path) + content_hash.
 * Usado por indexUserKbRoots para indexación incremental (no reindexar si hash igual).
 */
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { getUserKbIndexedDbPath } from './config';

const TABLE = 'user_kb_indexed';
let _db: Database.Database | null = null;

function ensureDirFor(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = getUserKbIndexedDbPath();
  ensureDirFor(dbPath);
  _db = new Database(dbPath);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      owner_user_id TEXT NOT NULL,
      source_path TEXT NOT NULL,
      content_hash TEXT,
      PRIMARY KEY (owner_user_id, source_path)
    );
  `);
  return _db;
}

export function keyOf(ownerUserId: string, sourcePath: string): string {
  return ownerUserId + '\0' + sourcePath;
}

export function loadUserKbKeysAndHashes(): { keys: Set<string>; hashes: Map<string, string> } {
  const db = getDb();
  const rows = db.prepare(`SELECT owner_user_id, source_path, content_hash FROM ${TABLE}`).all() as {
    owner_user_id: string;
    source_path: string;
    content_hash: string | null;
  }[];
  const keys = new Set<string>();
  const hashes = new Map<string, string>();
  for (const r of rows) {
    const k = keyOf(r.owner_user_id, r.source_path);
    keys.add(k);
    if (r.content_hash) hashes.set(k, r.content_hash);
  }
  return { keys, hashes };
}

export function setUserKbHash(ownerUserId: string, sourcePath: string, contentHash: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO ${TABLE} (owner_user_id, source_path, content_hash) VALUES (?, ?, ?)
     ON CONFLICT(owner_user_id, source_path) DO UPDATE SET content_hash = excluded.content_hash`
  ).run(ownerUserId, sourcePath, contentHash);
}
