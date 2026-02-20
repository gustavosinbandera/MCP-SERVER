/**
 * Unit tests for indexing-stats (daily indexing statistics).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { recordInbox, recordShared, recordUrl, getStatsByDay, close } from './indexing-stats';

describe('indexing-stats', () => {
  let dbPath: string;
  const origIndexStatsDb = process.env.INDEX_STATS_DB;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `indexing-stats-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    process.env.INDEX_STATS_DB = dbPath;
  });

  afterEach(() => {
    close();
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
    process.env.INDEX_STATS_DB = origIndexStatsDb;
  });

  it('returns empty array for getStatsByDay when no data', () => {
    expect(getStatsByDay(7)).toEqual([]);
  });

  it('returns empty array for getStatsByDay(0) and getStatsByDay(-1)', () => {
    recordInbox(1);
    expect(getStatsByDay(0)).toEqual([]);
    expect(getStatsByDay(-1)).toEqual([]);
  });

  it('accumulates inbox and returns by day', () => {
    recordInbox(2);
    recordInbox(3);
    const byDay = getStatsByDay(1);
    expect(byDay).toHaveLength(1);
    expect(byDay[0].inbox).toBe(5);
    expect(byDay[0].shared_new).toBe(0);
    expect(byDay[0].shared_reindexed).toBe(0);
    expect(byDay[0].url).toBe(0);
    expect(byDay[0].total).toBe(5);
    expect(byDay[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('accumulates shared_new and shared_reindexed', () => {
    recordShared(10, 2);
    recordShared(5, 1);
    const byDay = getStatsByDay(1);
    expect(byDay).toHaveLength(1);
    expect(byDay[0].inbox).toBe(0);
    expect(byDay[0].shared_new).toBe(15);
    expect(byDay[0].shared_reindexed).toBe(3);
    expect(byDay[0].url).toBe(0);
    expect(byDay[0].total).toBe(18);
  });

  it('accumulates url', () => {
    recordUrl(1);
    recordUrl(4);
    const byDay = getStatsByDay(1);
    expect(byDay).toHaveLength(1);
    expect(byDay[0].url).toBe(5);
    expect(byDay[0].total).toBe(5);
  });

  it('ignores recordInbox(0) and recordShared(0,0)', () => {
    recordInbox(0);
    recordShared(0, 0);
    expect(getStatsByDay(1)).toEqual([]);
  });

  it('combines all sources for total_today', () => {
    recordInbox(1);
    recordShared(2, 1);
    recordUrl(3);
    const byDay = getStatsByDay(1);
    expect(byDay).toHaveLength(1);
    expect(byDay[0].inbox).toBe(1);
    expect(byDay[0].shared_new).toBe(2);
    expect(byDay[0].shared_reindexed).toBe(1);
    expect(byDay[0].url).toBe(3);
    expect(byDay[0].total).toBe(7);
  });

  it('caps days at 365 for getStatsByDay', () => {
    recordInbox(1);
    const byDay = getStatsByDay(500);
    expect(byDay.length).toBeLessThanOrEqual(365);
  });
});
