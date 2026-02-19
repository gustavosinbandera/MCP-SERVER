/**
 * Shared Qdrant client singleton to avoid creating a new client per request.
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_URL } from './config';

let _client: QdrantClient | null = null;

export type QdrantClientOptions = { checkCompatibility?: boolean };

/**
 * Returns a shared Qdrant client instance. Uses config QDRANT_URL.
 */
export function getQdrantClient(options?: QdrantClientOptions): QdrantClient {
  if (_client != null) return _client;
  _client = new QdrantClient({
    url: QDRANT_URL,
    checkCompatibility: options?.checkCompatibility ?? false,
  } as { url: string; checkCompatibility?: boolean });
  return _client;
}
