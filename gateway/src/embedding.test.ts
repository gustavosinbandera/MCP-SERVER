/**
 * Unit tests for embedding (hasEmbedding, getVectorSize, embed with mocked OpenAI).
 */
import { hasEmbedding, getVectorSize, embed, EMBEDDING_DIMENSION, MAX_INPUT_CHARS } from './embedding';

const origOpenAIKey = process.env.OPENAI_API_KEY;

describe('embedding', () => {
  afterEach(() => {
    process.env.OPENAI_API_KEY = origOpenAIKey;
  });

  describe('hasEmbedding', () => {
    it('returns false when OPENAI_API_KEY is not set', () => {
      delete process.env.OPENAI_API_KEY;
      expect(hasEmbedding()).toBe(false);
    });

    it('returns false when OPENAI_API_KEY is empty or whitespace', () => {
      process.env.OPENAI_API_KEY = '   ';
      expect(hasEmbedding()).toBe(false);
    });

    it('returns true when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      expect(hasEmbedding()).toBe(true);
    });
  });

  describe('getVectorSize', () => {
    it('returns 1 when no embedding', () => {
      delete process.env.OPENAI_API_KEY;
      expect(getVectorSize()).toBe(1);
    });

    it('returns EMBEDDING_DIMENSION when embedding available', () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      expect(getVectorSize()).toBe(EMBEDDING_DIMENSION);
    });
  });

  describe('constants', () => {
    it('EMBEDDING_DIMENSION is 1536', () => {
      expect(EMBEDDING_DIMENSION).toBe(1536);
    });

    it('MAX_INPUT_CHARS is 32000', () => {
      expect(MAX_INPUT_CHARS).toBe(32_000);
    });
  });

  describe('embed', () => {
    it('returns null when OPENAI_API_KEY is not set', async () => {
      delete process.env.OPENAI_API_KEY;
      expect(await embed('hello')).toBeNull();
    });
  });
});
