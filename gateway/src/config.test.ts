/**
 * Unit tests for config (env-derived paths and constants).
 */
import * as path from 'path';
import {
  QDRANT_URL,
  COLLECTION_NAME,
  MAX_FILE_SIZE_BYTES,
  BATCH_UPSERT_SIZE,
  INDEX_CONCURRENCY,
  getInboxPath,
  getSharedDirsEntries,
  getSharedRoots,
} from './config';

describe('config', () => {
  const origIndexInbox = process.env.INDEX_INBOX_DIR;
  const origSharedDirs = process.env.SHARED_DIRS;

  afterEach(() => {
    process.env.INDEX_INBOX_DIR = origIndexInbox;
    process.env.SHARED_DIRS = origSharedDirs;
  });

  describe('constants', () => {
    it('COLLECTION_NAME is mcp_docs', () => {
      expect(COLLECTION_NAME).toBe('mcp_docs');
    });

    it('MAX_FILE_SIZE_BYTES is 2MB', () => {
      expect(MAX_FILE_SIZE_BYTES).toBe(2 * 1024 * 1024);
    });

    it('BATCH_UPSERT_SIZE is 50', () => {
      expect(BATCH_UPSERT_SIZE).toBe(50);
    });

    it('QDRANT_URL defaults or uses env', () => {
      expect(typeof QDRANT_URL).toBe('string');
      expect(QDRANT_URL.length).toBeGreaterThan(0);
    });

    it('INDEX_CONCURRENCY is between 1 and 20', () => {
      expect(INDEX_CONCURRENCY).toBeGreaterThanOrEqual(1);
      expect(INDEX_CONCURRENCY).toBeLessThanOrEqual(20);
    });
  });

  describe('getInboxPath', () => {
    it('returns resolved path when INDEX_INBOX_DIR is set', () => {
      const custom = path.join(path.sep, 'tmp', 'custom_inbox');
      process.env.INDEX_INBOX_DIR = custom;
      expect(getInboxPath()).toBe(path.resolve(custom));
    });

    it('returns default relative path when INDEX_INBOX_DIR is empty', () => {
      delete process.env.INDEX_INBOX_DIR;
      const p = getInboxPath();
      expect(p).toContain('INDEX_INBOX');
      expect(path.isAbsolute(p)).toBe(true);
    });

    it('trims INDEX_INBOX_DIR', () => {
      process.env.INDEX_INBOX_DIR = '  /tmp/inbox  ';
      expect(getInboxPath()).toBe(path.resolve('/tmp/inbox'));
    });
  });

  describe('getSharedDirsEntries', () => {
    it('returns empty array when SHARED_DIRS is empty', () => {
      delete process.env.SHARED_DIRS;
      expect(getSharedDirsEntries()).toEqual([]);
    });

    it('parses "project:path" format', () => {
      const dir = path.join(path.sep, 'data', 'myproject');
      process.env.SHARED_DIRS = `proj1:${dir}`;
      const entries = getSharedDirsEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].project).toBe('proj1');
      expect(entries[0].path).toBe(path.resolve(dir));
    });

    it('parses path-only (project = basename)', () => {
      const dir = path.join(path.sep, 'data', 'myfolder');
      process.env.SHARED_DIRS = dir;
      const entries = getSharedDirsEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].project).toBe('myfolder');
      expect(entries[0].path).toBe(path.resolve(dir));
    });

    it('splits by ; or |', () => {
      const d1 = path.join(path.sep, 'a');
      const d2 = path.join(path.sep, 'b');
      process.env.SHARED_DIRS = `${d1};${d2}`;
      const entries = getSharedDirsEntries();
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.path)).toContain(path.resolve(d1));
      expect(entries.map((e) => e.path)).toContain(path.resolve(d2));
    });
  });

  describe('getSharedRoots', () => {
    it('returns paths from getSharedDirsEntries', () => {
      const dir = path.join(path.sep, 'shared');
      process.env.SHARED_DIRS = `p:${dir}`;
      expect(getSharedRoots()).toEqual([path.resolve(dir)]);
    });
  });
});
