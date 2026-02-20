/**
 * Persistent index of (project, source_path) [+ content_hash] in SQLite.
 * Used to avoid full Qdrant scroll on each index cycle when INDEX_USE_PERSISTENT_KEYS is set.
 */
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { QdrantClient } from '@qdrant/js-client-rest';
import { COLLECTION_NAME } from './config';
import { error as logError } from './logger';

function keyOf(project: string, sourcePath: string): string {
  return project + '\0' + sourcePath;
}

const SCROLL_PAGE_SIZE = 500;
const TABLE = 'indexed_keys';

let _db: Database.Database | null = null;

function getDbPath(): string {
  const raw = process.env.INDEXED_KEYS_DB?.trim();
  if (raw) return path.resolve(raw);
  return path.resolve(__dirname, '..', 'data', 'indexed_keys.db');
}

function ensureDirFor(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = getDbPath();
  ensureDirFor(dbPath);
  _db = new Database(dbPath);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      project TEXT NOT NULL,
      source_path TEXT NOT NULL,
      content_hash TEXT,
      PRIMARY KEY (project, source_path)
    );
  `);
  return _db;
}

/**
 * Returns true if the persistent index is enabled and the DB file exists or can be created.
 */
export function isPersistentIndexEnabled(): boolean {
  const v = process.env.INDEX_USE_PERSISTENT_KEYS?.toLowerCase();
  if (v !== '1' && v !== 'true' && v !== 'yes') return false;
  try {
    getDbPath();
    ensureDirFor(getDbPath());
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads all keys from SQLite. Call only when isPersistentIndexEnabled().
 */
export function getKeys(): Set<string> {
  const db = getDb();
  const rows = db.prepare(`SELECT project, source_path FROM ${TABLE}`).all() as { project: string; source_path: string }[];
  const set = new Set<string>();
  for (const r of rows) set.add(keyOf(r.project, r.source_path));
  return set;
}

/**
 * Loads keys and content_hash from SQLite. Call only when isPersistentIndexEnabled().
 */
export function getKeysAndHashes(): { keys: Set<string>; hashes: Map<string, string> } {
  const db = getDb();
  const rows = db.prepare(`SELECT project, source_path, content_hash FROM ${TABLE}`).all() as { project: string; source_path: string; content_hash: string | null }[];
  const keys = new Set<string>();
  const hashes = new Map<string, string>();
  for (const r of rows) {
    const key = keyOf(r.project, r.source_path);
    keys.add(key);
    if (r.content_hash) hashes.set(key, r.content_hash);
  }
  return { keys, hashes };
}

/**
 * Adds or replaces (project, source_path) with optional content_hash.
 */
export function addKey(project: string, sourcePath: string, contentHash?: string | null): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO ${TABLE} (project, source_path, content_hash) VALUES (?, ?, ?)
     ON CONFLICT (project, source_path) DO UPDATE SET content_hash = excluded.content_hash`
  ).run(project, sourcePath, contentHash ?? null);
}

/**
 * Removes one (project, source_path) from the index.
 */
export function removeKey(project: string, sourcePath: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM ${TABLE} WHERE project = ? AND source_path = ?`).run(project, sourcePath);
}

/**
 * Clears all rows (e.g. before full rebuild).
 */
export function clearAll(): void {
  const db = getDb();
  db.prepare(`DELETE FROM ${TABLE}`).run();
}

/**
 * Rebuilds the SQLite index from Qdrant (full scroll). Use when DB is missing/corrupt or on demand.
 */
export async function rebuildFromQdrant(client: QdrantClient): Promise<void> {
  clearAll();
  const keys = new Set<string>();
  const hashes = new Map<string, string>();
  let offset: string | number | Record<string, unknown> | null | undefined = undefined;
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR REPLACE INTO ${TABLE} (project, source_path, content_hash) VALUES (?, ?, ?)`
  );
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);
    if (!exists) return;

    for (;;) {
      const { points, next_page_offset } = await client.scroll(COLLECTION_NAME, {
        limit: SCROLL_PAGE_SIZE,
        offset,
        with_payload: { include: ['project', 'title', 'content_hash'] },
        with_vector: false,
      });
      for (const p of points) {
        const payload = p.payload as { project?: string; title?: string; content_hash?: string } | undefined;
        const project = payload?.project ?? '';
        const title = payload?.title ?? '';
        if (project || title) {
          const key = keyOf(project, title);
          keys.add(key);
          const h = payload?.content_hash;
          if (typeof h === 'string' && h && !hashes.has(key)) hashes.set(key, h);
          insert.run(project, title, typeof h === 'string' && h ? h : null);
        }
      }
      if (next_page_offset == null) break;
      offset = next_page_offset;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('indexed-keys-db rebuildFromQdrant failed', { err: msg });
    throw new Error(`indexed-keys-db rebuildFromQdrant failed: ${msg}`);
  }
}

/**
 * Closes the DB connection (e.g. on shutdown). Idempotent.
 */
export function close(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
