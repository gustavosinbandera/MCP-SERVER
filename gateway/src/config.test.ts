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
  getSharedReindexChanged,
  getSharedSyncDeleted,
  getIndexedKeysDbPath,
  getUsePersistentIndexedKeys,
  getBranchForProject,
  getDomainForPath,
} from './config';

describe('config', () => {
  const origIndexInbox = process.env.INDEX_INBOX_DIR;
  const origSharedDirs = process.env.SHARED_DIRS;
  const origReindex = process.env.INDEX_SHARED_REINDEX_CHANGED;
  const origSyncDeleted = process.env.INDEX_SHARED_SYNC_DELETED;
  const origIndexedKeysDb = process.env.INDEXED_KEYS_DB;
  const origUsePersistent = process.env.INDEX_USE_PERSISTENT_KEYS;
  const origBranchProjects = process.env.BRANCH_PROJECTS;
  const origDomainKeywords = process.env.DOMAIN_KEYWORDS;

  afterEach(() => {
    process.env.INDEX_INBOX_DIR = origIndexInbox;
    process.env.SHARED_DIRS = origSharedDirs;
    process.env.INDEX_SHARED_REINDEX_CHANGED = origReindex;
    process.env.INDEX_SHARED_SYNC_DELETED = origSyncDeleted;
    process.env.INDEXED_KEYS_DB = origIndexedKeysDb;
    process.env.INDEX_USE_PERSISTENT_KEYS = origUsePersistent;
    process.env.BRANCH_PROJECTS = origBranchProjects;
    process.env.DOMAIN_KEYWORDS = origDomainKeywords;
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

  describe('getSharedReindexChanged', () => {
    it('returns false when unset or 0/false', () => {
      delete process.env.INDEX_SHARED_REINDEX_CHANGED;
      expect(getSharedReindexChanged()).toBe(false);
      process.env.INDEX_SHARED_REINDEX_CHANGED = '0';
      expect(getSharedReindexChanged()).toBe(false);
      process.env.INDEX_SHARED_REINDEX_CHANGED = 'false';
      expect(getSharedReindexChanged()).toBe(false);
    });

    it('returns true for 1, true, yes (case insensitive)', () => {
      process.env.INDEX_SHARED_REINDEX_CHANGED = '1';
      expect(getSharedReindexChanged()).toBe(true);
      process.env.INDEX_SHARED_REINDEX_CHANGED = 'true';
      expect(getSharedReindexChanged()).toBe(true);
      process.env.INDEX_SHARED_REINDEX_CHANGED = 'YES';
      expect(getSharedReindexChanged()).toBe(true);
    });
  });

  describe('getSharedSyncDeleted', () => {
    it('returns false when unset', () => {
      delete process.env.INDEX_SHARED_SYNC_DELETED;
      expect(getSharedSyncDeleted()).toBe(false);
    });

    it('returns true for 1, true, yes', () => {
      process.env.INDEX_SHARED_SYNC_DELETED = 'true';
      expect(getSharedSyncDeleted()).toBe(true);
    });
  });

  describe('getIndexedKeysDbPath', () => {
    it('returns resolved path when INDEXED_KEYS_DB is set', () => {
      const custom = path.join(path.sep, 'var', 'data', 'keys.db');
      process.env.INDEXED_KEYS_DB = custom;
      expect(getIndexedKeysDbPath()).toBe(path.resolve(custom));
    });

    it('returns default path containing data/indexed_keys.db when unset', () => {
      delete process.env.INDEXED_KEYS_DB;
      const p = getIndexedKeysDbPath();
      expect(p).toContain('data');
      expect(p).toContain('indexed_keys.db');
      expect(path.isAbsolute(p)).toBe(true);
    });
  });

  describe('getUsePersistentIndexedKeys', () => {
    it('returns false when unset', () => {
      delete process.env.INDEX_USE_PERSISTENT_KEYS;
      expect(getUsePersistentIndexedKeys()).toBe(false);
    });

    it('returns true for 1, true, yes', () => {
      process.env.INDEX_USE_PERSISTENT_KEYS = 'true';
      expect(getUsePersistentIndexedKeys()).toBe(true);
    });
  });

  describe('getBranchForProject', () => {
    it('returns classic for alias classic, clasic, core (exact or contained)', () => {
      delete process.env.BRANCH_PROJECTS;
      expect(getBranchForProject('classic')).toBe('classic');
      expect(getBranchForProject('clasic')).toBe('classic');
      expect(getBranchForProject('core')).toBe('classic');
      expect(getBranchForProject('classic-main')).toBe('classic');
      expect(getBranchForProject('core-accounting')).toBe('classic');
    });

    it('returns blueivory for alias bi, BI, blueivory, blue-ivory and bi- prefix', () => {
      delete process.env.BRANCH_PROJECTS;
      expect(getBranchForProject('bi')).toBe('blueivory');
      expect(getBranchForProject('BI')).toBe('blueivory');
      expect(getBranchForProject('blueivory')).toBe('blueivory');
      expect(getBranchForProject('blue-ivory')).toBe('blueivory');
      expect(getBranchForProject('blueivory-main')).toBe('blueivory');
      expect(getBranchForProject('bi-warehouse')).toBe('blueivory');
    });

    it('uses BRANCH_PROJECTS when set', () => {
      process.env.BRANCH_PROJECTS = 'classic:classic-core;blueivory:bi-main';
      expect(getBranchForProject('classic-core')).toBe('classic');
      expect(getBranchForProject('bi-main')).toBe('blueivory');
    });

    it('returns undefined for unknown project when no env', () => {
      delete process.env.BRANCH_PROJECTS;
      expect(getBranchForProject('other-project')).toBeUndefined();
    });
  });

  describe('getDomainForPath', () => {
    it('returns undefined when DOMAIN_KEYWORDS unset', () => {
      delete process.env.DOMAIN_KEYWORDS;
      expect(getDomainForPath('proj', 'Accounting/foo.txt')).toBeUndefined();
    });

    it('returns domain when path contains keyword', () => {
      process.env.DOMAIN_KEYWORDS = 'accounting:accounting,account;warehouse:warehouse,wr';
      expect(getDomainForPath('proj', 'Accounting/foo.txt')).toBe('accounting');
      expect(getDomainForPath('proj', 'src/warehouse/receipt.js')).toBe('warehouse');
    });
  });
});
