/**
 * Unit tests for indexed-keys-db (SQLite persistent index of keys).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  isPersistentIndexEnabled,
  getKeys,
  getKeysAndHashes,
  addKey,
  removeKey,
  clearAll,
  rebuildFromQdrant,
  close,
} from './indexed-keys-db';
import { indexedKey } from './search';
import { COLLECTION_NAME } from './config';

describe('indexed-keys-db', () => {
  let dbPath: string;
  const origUsePersistent = process.env.INDEX_USE_PERSISTENT_KEYS;
  const origIndexedKeysDb = process.env.INDEXED_KEYS_DB;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `indexed-keys-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    process.env.INDEXED_KEYS_DB = dbPath;
    process.env.INDEX_USE_PERSISTENT_KEYS = 'true';
  });

  afterEach(() => {
    close();
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
    process.env.INDEX_USE_PERSISTENT_KEYS = origUsePersistent;
    process.env.INDEXED_KEYS_DB = origIndexedKeysDb;
  });

  describe('isPersistentIndexEnabled', () => {
    it('returns false when INDEX_USE_PERSISTENT_KEYS is not set', () => {
      delete process.env.INDEX_USE_PERSISTENT_KEYS;
      expect(isPersistentIndexEnabled()).toBe(false);
    });

    it('returns false for empty or invalid value', () => {
      process.env.INDEX_USE_PERSISTENT_KEYS = '';
      expect(isPersistentIndexEnabled()).toBe(false);
      process.env.INDEX_USE_PERSISTENT_KEYS = '0';
      expect(isPersistentIndexEnabled()).toBe(false);
    });

    it('returns true for 1, true, yes (case insensitive)', () => {
      process.env.INDEX_USE_PERSISTENT_KEYS = '1';
      expect(isPersistentIndexEnabled()).toBe(true);
      process.env.INDEX_USE_PERSISTENT_KEYS = 'true';
      expect(isPersistentIndexEnabled()).toBe(true);
      process.env.INDEX_USE_PERSISTENT_KEYS = 'YES';
      expect(isPersistentIndexEnabled()).toBe(true);
    });
  });

  describe('getKeys / getKeysAndHashes', () => {
    it('returns empty set and map when DB is empty', () => {
      const keys = getKeys();
      expect(keys.size).toBe(0);
      const { keys: k2, hashes } = getKeysAndHashes();
      expect(k2.size).toBe(0);
      expect(hashes.size).toBe(0);
    });

    it('returns keys after addKey', () => {
      addKey('proj', 'path/to/doc');
      addKey('proj2', 'other');
      const keys = getKeys();
      expect(keys.size).toBe(2);
      expect(keys.has(indexedKey('proj', 'path/to/doc'))).toBe(true);
      expect(keys.has(indexedKey('proj2', 'other'))).toBe(true);
    });

    it('returns hashes when content_hash was set', () => {
      addKey('p', 's', 'abc123');
      const { keys, hashes } = getKeysAndHashes();
      expect(keys.has(indexedKey('p', 's'))).toBe(true);
      expect(hashes.get(indexedKey('p', 's'))).toBe('abc123');
    });

    it('updates hash on conflict (same project, source_path)', () => {
      addKey('p', 's', 'old');
      addKey('p', 's', 'new');
      const { hashes } = getKeysAndHashes();
      expect(hashes.get(indexedKey('p', 's'))).toBe('new');
    });
  });

  describe('removeKey', () => {
    it('removes the key', () => {
      addKey('proj', 'path');
      expect(getKeys().size).toBe(1);
      removeKey('proj', 'path');
      expect(getKeys().size).toBe(0);
    });

    it('is idempotent when key does not exist', () => {
      removeKey('nonexistent', 'path');
      expect(getKeys().size).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('removes all rows', () => {
      addKey('p1', 's1');
      addKey('p2', 's2');
      expect(getKeys().size).toBe(2);
      clearAll();
      expect(getKeys().size).toBe(0);
    });
  });

  describe('rebuildFromQdrant', () => {
    it('does nothing when collection does not exist', async () => {
      const client = {
        getCollections: jest.fn().mockResolvedValue({ collections: [] }),
      };
      await rebuildFromQdrant(client as never);
      expect(getKeys().size).toBe(0);
    });

    it('populates DB from scroll result', async () => {
      const client = {
        getCollections: jest.fn().mockResolvedValue({ collections: [{ name: COLLECTION_NAME }] }),
        scroll: jest.fn().mockResolvedValue({
          points: [
            { payload: { project: 'p1', title: 't1', content_hash: 'h1' } },
            { payload: { project: 'p2', title: 't2', content_hash: null } },
          ],
          next_page_offset: null,
        }),
      };
      await rebuildFromQdrant(client as never);
      const keys = getKeys();
      expect(keys.size).toBe(2);
      expect(keys.has(indexedKey('p1', 't1'))).toBe(true);
      expect(keys.has(indexedKey('p2', 't2'))).toBe(true);
      const { hashes } = getKeysAndHashes();
      expect(hashes.get(indexedKey('p1', 't1'))).toBe('h1');
      expect(hashes.has(indexedKey('p2', 't2'))).toBe(false);
    });

    it('clears existing rows before rebuilding', async () => {
      addKey('old', 'path');
      const client = {
        getCollections: jest.fn().mockResolvedValue({ collections: [{ name: COLLECTION_NAME }] }),
        scroll: jest.fn().mockResolvedValue({
          points: [{ payload: { project: 'new', title: 't', content_hash: null } }],
          next_page_offset: null,
        }),
      };
      await rebuildFromQdrant(client as never);
      const keys = getKeys();
      expect(keys.size).toBe(1);
      expect(keys.has(indexedKey('new', 't'))).toBe(true);
      expect(keys.has(indexedKey('old', 'path'))).toBe(false);
    });

    it('throws when client fails', async () => {
      const client = {
        getCollections: jest.fn().mockRejectedValue(new Error('connection refused')),
      };
      await expect(rebuildFromQdrant(client as never)).rejects.toThrow('indexed-keys-db rebuildFromQdrant failed');
    });
  });

  describe('close', () => {
    it('allows reopening with getKeys after close', () => {
      addKey('p', 's');
      close();
      process.env.INDEXED_KEYS_DB = dbPath; // same path
      const keys = getKeys();
      expect(keys.size).toBe(1);
    });
  });
});
