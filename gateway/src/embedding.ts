/**
 * OpenAI embeddings for semantic search.
 * Uses text-embedding-3-small (1536 dimensions). Truncates input to model limit.
 * Retries on transient failure; throws on error after retries (no silent fallback).
 */
import OpenAI from 'openai';
import { warn, error as logError } from './logger';

const MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
/** text-embedding-3-small max tokens per input is 8191; ~4 chars per token -> ~32k chars safe */
export const MAX_INPUT_CHARS = 32_000;

const EMBED_TIMEOUT_MS = Number(process.env.OPENAI_EMBED_TIMEOUT_MS) || 30_000;
const EMBED_RETRY_ATTEMPTS = Math.min(Math.max(0, Number(process.env.OPENAI_EMBED_RETRY_ATTEMPTS) || 2), 5);

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (_client != null) return _client;
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  _client = new OpenAI({ apiKey: key });
  return _client;
}

/**
 * Dimension of vectors produced by the current model (text-embedding-3-small = 1536).
 */
export const EMBEDDING_DIMENSION = 1536;

/**
 * Returns the embedding vector for the given text, or null if OpenAI is not configured.
 * Truncates text to model limit if necessary.
 * Retries on transient failure; throws Error after retries (propagate, do not swallow).
 */
export async function embed(text: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) return null;

  const truncated = text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= EMBED_RETRY_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
    try {
      const res = await client.embeddings.create(
        {
          model: MODEL,
          input: truncated,
        },
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
      const vec = res.data?.[0]?.embedding;
      if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMENSION) {
        throw new Error(`Unexpected embedding shape: expected length ${EMBEDDING_DIMENSION}`);
      }
      return vec;
    } catch (err) {
      clearTimeout(timeoutId);
      lastErr = err;
      const isRetryable =
        err instanceof Error &&
        (err.name === 'AbortError' ||
          err.message.includes('ECONNRESET') ||
          err.message.includes('ETIMEDOUT') ||
          err.message.includes('rate_limit'));
      if (attempt < EMBED_RETRY_ATTEMPTS && isRetryable) {
        const delayMs = 500 * Math.pow(2, attempt);
        warn('Embedding retry', { attempt: attempt + 1, maxAttempts: EMBED_RETRY_ATTEMPTS + 1, delayMs, err: err instanceof Error ? err.message : String(err) });
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      logError('Embedding failed after retries', { attempts: attempt + 1, err: msg });
      throw new Error(`Embedding failed after ${attempt + 1} attempt(s): ${msg}`);
    }
  }

  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`Embedding failed: ${msg}`);
}

/**
 * Returns true if embeddings are available (OPENAI_API_KEY set).
 */
export function hasEmbedding(): boolean {
  return !!process.env.OPENAI_API_KEY?.trim();
}

/**
 * Vector size for Qdrant collection (evaluated at runtime).
 */
export function getVectorSize(): number {
  return hasEmbedding() ? EMBEDDING_DIMENSION : 1;
}
