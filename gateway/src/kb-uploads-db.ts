/**
 * SQLite for KB upload records: user_id, project, file_path, source, created_at.
 * Used by POST /kb/upload to store project-related information.
 */
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { getKbUploadsDbPath } from './config';

const TABLE = 'kb_uploads';
let _db: Database.Database | null = null;

function ensureDirFor(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = getKbUploadsDbPath();
  ensureDirFor(dbPath);
  _db = new Database(dbPath);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      project TEXT NOT NULL,
      file_path TEXT NOT NULL,
      source TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return _db;
}

export type InsertKbUploadParams = {
  userId: string;
  project: string;
  filePath: string;
  source?: string;
};

/** Insert a KB upload record and return its id. */
export function insertKbUpload(params: InsertKbUploadParams): number {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO ${TABLE} (user_id, project, file_path, source, created_at) VALUES (?, ?, ?, ?, ?)`
  );
  const result = stmt.run(
    params.userId || 'local',
    params.project || '',
    params.filePath,
    params.source ?? null,
    now
  );
  return result.lastInsertRowid as number;
}

export type KbUploadRow = {
  id: number;
  user_id: string;
  project: string;
  file_path: string;
  source: string | null;
  created_at: string;
};

/** List upload records by project (optional; for future queries). */
export function listKbUploadsByProject(project: string): KbUploadRow[] {
  const db = getDb();
  return db.prepare(`SELECT id, user_id, project, file_path, source, created_at FROM ${TABLE} WHERE project = ? ORDER BY created_at DESC`).all(project) as KbUploadRow[];
}
