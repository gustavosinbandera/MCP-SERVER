/**
 * Daily indexing statistics: persist and query file counts per day (inbox, shared, url).
 * Uses SQLite (data/indexing_stats.db by default). Degrades gracefully if DB is not writable.
 */
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { getIndexingStatsDbPath } from './config';
import { error as logError } from './logger';

const TABLE = 'daily_stats';

let _db: Database.Database | null = null;

function ensureDirFor(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getDb(): Database.Database | null {
  if (_db) return _db;
  try {
    const dbPath = getIndexingStatsDbPath();
    ensureDirFor(dbPath);
    _db = new Database(dbPath);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        date TEXT PRIMARY KEY,
        inbox INTEGER NOT NULL DEFAULT 0,
        shared_new INTEGER NOT NULL DEFAULT 0,
        shared_reindexed INTEGER NOT NULL DEFAULT 0,
        url INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);
    return _db;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('indexing-stats: failed to open DB', { err: msg });
    return null;
  }
}

function todayUtc(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Adds count to today's inbox total. No-op if DB unavailable.
 */
export function recordInbox(count: number): void {
  if (count <= 0) return;
  const db = getDb();
  if (!db) return;
  try {
    const date = todayUtc();
    const now = nowIso();
    db.prepare(
      `INSERT INTO ${TABLE} (date, inbox, shared_new, shared_reindexed, url, updated_at)
       VALUES (?, ?, 0, 0, 0, ?)
       ON CONFLICT(date) DO UPDATE SET
         inbox = inbox + excluded.inbox,
         updated_at = excluded.updated_at`
    ).run(date, count, now);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('indexing-stats: recordInbox failed', { err: msg });
  }
}

/**
 * Adds new and reindexed counts to today's shared totals. No-op if DB unavailable.
 */
export function recordShared(newCount: number, reindexedCount: number): void {
  if (newCount <= 0 && reindexedCount <= 0) return;
  const db = getDb();
  if (!db) return;
  try {
    const date = todayUtc();
    const now = nowIso();
    db.prepare(
      `INSERT INTO ${TABLE} (date, inbox, shared_new, shared_reindexed, url, updated_at)
       VALUES (?, 0, ?, ?, 0, ?)
       ON CONFLICT(date) DO UPDATE SET
         shared_new = shared_new + excluded.shared_new,
         shared_reindexed = shared_reindexed + excluded.shared_reindexed,
         updated_at = excluded.updated_at`
    ).run(date, newCount, reindexedCount, now);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('indexing-stats: recordShared failed', { err: msg });
  }
}

/**
 * Adds count to today's url total. No-op if DB unavailable.
 */
export function recordUrl(count: number): void {
  if (count <= 0) return;
  const db = getDb();
  if (!db) return;
  try {
    const date = todayUtc();
    const now = nowIso();
    db.prepare(
      `INSERT INTO ${TABLE} (date, inbox, shared_new, shared_reindexed, url, updated_at)
       VALUES (?, 0, 0, 0, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         url = url + excluded.url,
         updated_at = excluded.updated_at`
    ).run(date, count, now);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('indexing-stats: recordUrl failed', { err: msg });
  }
}

export type DayStats = {
  date: string;
  inbox: number;
  shared_new: number;
  shared_reindexed: number;
  url: number;
  total: number;
};

/**
 * Returns stats for the last N days (today first). Returns [] if DB unavailable or days <= 0.
 */
export function getStatsByDay(days: number): DayStats[] {
  if (days <= 0) return [];
  const db = getDb();
  if (!db) return [];
  try {
    const cap = Math.min(Math.max(1, Math.floor(days)), 365);
    const rows = db.prepare(
      `SELECT date, inbox, shared_new, shared_reindexed, url
       FROM ${TABLE}
       ORDER BY date DESC
       LIMIT ?`
    ).all(cap) as { date: string; inbox: number; shared_new: number; shared_reindexed: number; url: number }[];
    return rows.map((r) => ({
      date: r.date,
      inbox: r.inbox,
      shared_new: r.shared_new,
      shared_reindexed: r.shared_reindexed,
      url: r.url,
      total: r.inbox + r.shared_new + r.shared_reindexed + r.url,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('indexing-stats: getStatsByDay failed', { err: msg });
    return [];
  }
}

/**
 * Closes the DB connection (for tests). Next getDb() will open again.
 */
export function close(): void {
  if (_db) {
    try {
      _db.close();
    } catch {
      // ignore
    }
    _db = null;
  }
}
