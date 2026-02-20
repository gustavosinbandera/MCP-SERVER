/**
 * Unit tests for chunking.
 */
import {
  chunkText,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_THRESHOLD,
  type ChunkItem,
} from './chunking';

describe('chunking', () => {
  describe('chunkText', () => {
    it('returns single chunk when content length <= threshold', () => {
      const short = 'a'.repeat(DEFAULT_CHUNK_THRESHOLD);
      const result = chunkText(short);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ text: short, chunk_index: 0, total_chunks: 1 });
    });

    it('returns single chunk for empty string', () => {
      const result = chunkText('');
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('');
      expect(result[0].chunk_index).toBe(0);
      expect(result[0].total_chunks).toBe(1);
    });

    it('splits content above threshold into multiple chunks with overlap', () => {
      const size = 500;
      const overlap = 50;
      const content = 'x'.repeat(1200);
      const result = chunkText(content, { chunkSize: size, overlap, threshold: 400 });
      expect(result.length).toBeGreaterThan(1);
      const total = result.length;
      result.forEach((chunk: ChunkItem, i: number) => {
        expect(chunk.chunk_index).toBe(i);
        expect(chunk.total_chunks).toBe(total);
        expect(chunk.text.length).toBeLessThanOrEqual(size + overlap);
      });
    });

    it('uses default options when none provided', () => {
      const long = 'b'.repeat(DEFAULT_CHUNK_THRESHOLD + DEFAULT_CHUNK_SIZE + 500);
      const result = chunkText(long);
      expect(result.length).toBeGreaterThan(1);
      expect(result[0].total_chunks).toBe(result.length);
    });

    it('respects custom threshold', () => {
      const content = 'c'.repeat(600);
      const result = chunkText(content, { threshold: 1000 });
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe(content);
    });

    it('caps overlap to chunkSize - 1', () => {
      const content = 'd'.repeat(800);
      const result = chunkText(content, { chunkSize: 300, overlap: 400, threshold: 50 });
      expect(result.length).toBeGreaterThan(1);
      result.forEach((c) => expect(c.text.length).toBeLessThanOrEqual(300));
    });
  });
});
