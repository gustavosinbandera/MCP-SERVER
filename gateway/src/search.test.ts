/**
 * Unit tests for search (indexedKey pure; loadExistingIndexedKeys, searchDocs with mocked Qdrant).
 */
import { indexedKey, loadExistingIndexedKeys, searchDocs, countDocs } from './search';
import { getQdrantClient } from './qdrant-client';
import { COLLECTION_NAME } from './config';

jest.mock('./qdrant-client');
jest.mock('./embedding', () => ({
  embed: jest.fn().mockResolvedValue(new Array(1536).fill(0)),
  hasEmbedding: jest.fn().mockReturnValue(true),
}));

const mockGetQdrantClient = getQdrantClient as jest.MockedFunction<typeof getQdrantClient>;

describe('search', () => {
  describe('indexedKey', () => {
    it('joins project and sourcePath with null byte', () => {
      expect(indexedKey('proj', 'path/to/doc')).toBe('proj\0path/to/doc');
    });

    it('allows empty project or path', () => {
      expect(indexedKey('', 'title')).toBe('\0title');
      expect(indexedKey('p', '')).toBe('p\0');
    });

    it('produces unique keys for different (project, path)', () => {
      expect(indexedKey('a', 'x')).not.toBe(indexedKey('a', 'y'));
      expect(indexedKey('a', 'x')).not.toBe(indexedKey('b', 'x'));
    });
  });

  describe('loadExistingIndexedKeys', () => {
    it('returns empty set when collection does not exist', async () => {
      const client = {
        getCollections: jest.fn().mockResolvedValue({ collections: [] }),
      };
      mockGetQdrantClient.mockReturnValue(client as never);
      const keys = await loadExistingIndexedKeys(client as never);
      expect(keys.size).toBe(0);
    });

    it('returns set of keys from scroll pages', async () => {
      const client = {
        getCollections: jest.fn().mockResolvedValue({ collections: [{ name: COLLECTION_NAME }] }),
        scroll: jest
          .fn()
          .mockResolvedValueOnce({
            points: [
              { payload: { project: 'p1', title: 't1' } },
              { payload: { project: 'p2', title: 't2' } },
            ],
            next_page_offset: 1,
          })
          .mockResolvedValueOnce({
            points: [{ payload: { project: 'p3', title: 't3' } }],
            next_page_offset: null,
          }),
      };
      mockGetQdrantClient.mockReturnValue(client as never);
      const keys = await loadExistingIndexedKeys(client as never);
      expect(keys.size).toBe(3);
      expect(keys.has(indexedKey('p1', 't1'))).toBe(true);
      expect(keys.has(indexedKey('p2', 't2'))).toBe(true);
      expect(keys.has(indexedKey('p3', 't3'))).toBe(true);
    });

    it('throws on client error', async () => {
      const client = {
        getCollections: jest.fn().mockRejectedValue(new Error('connection refused')),
      };
      mockGetQdrantClient.mockReturnValue(client as never);
      await expect(loadExistingIndexedKeys(client as never)).rejects.toThrow('loadExistingIndexedKeys failed');
    });
  });

  describe('searchDocs', () => {
    it('returns empty results when collection does not exist', async () => {
      const client = {
        getCollections: jest.fn().mockResolvedValue({ collections: [] }),
      };
      mockGetQdrantClient.mockReturnValue(client as never);
      const result = await searchDocs('query', 10);
      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('returns search results when collection exists and has embedding', async () => {
      const client = {
        getCollections: jest.fn().mockResolvedValue({ collections: [{ name: COLLECTION_NAME }] }),
        search: jest.fn().mockResolvedValue([
          { id: 'id1', payload: { title: 'Doc 1', content: 'hello' }, score: 0.9 },
        ]),
      };
      mockGetQdrantClient.mockReturnValue(client as never);
      const result = await searchDocs('hello', 10);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe('id1');
      expect(result.results[0].payload?.title).toBe('Doc 1');
      expect(result.total).toBe(1);
    });
  });

  describe('countDocs', () => {
    it('returns 0 when collection does not exist', async () => {
      const client = {
        getCollections: jest.fn().mockResolvedValue({ collections: [] }),
      };
      mockGetQdrantClient.mockReturnValue(client as never);
      const result = await countDocs();
      expect(result.count).toBe(0);
      expect(result.collection).toBe(COLLECTION_NAME);
    });

    it('returns count from client', async () => {
      const client = {
        getCollections: jest.fn().mockResolvedValue({ collections: [{ name: COLLECTION_NAME }] }),
        count: jest.fn().mockResolvedValue({ count: 42 }),
      };
      mockGetQdrantClient.mockReturnValue(client as never);
      const result = await countDocs();
      expect(result.count).toBe(42);
      expect(result.collection).toBe(COLLECTION_NAME);
    });
  });
});
