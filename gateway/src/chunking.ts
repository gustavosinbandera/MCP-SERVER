/**
 * Chunking for long documents: split by size with overlap for better semantic continuity.
 */

/** Default max characters per chunk (~500–600 tokens at ~4 chars/token) */
export const DEFAULT_CHUNK_SIZE = 2400;
/** Overlap in characters to avoid cutting mid-sentence */
export const DEFAULT_CHUNK_OVERLAP = 200;
/** Below this length we don't chunk (one point per doc) */
export const DEFAULT_CHUNK_THRESHOLD = 500;

export type ChunkItem = {
  text: string;
  chunk_index: number;
  total_chunks: number;
};

/**
 * Splits content into chunks by character count with overlap.
 * If content length <= threshold, returns a single chunk.
 */
export function chunkText(
  content: string,
  options?: {
    chunkSize?: number;
    overlap?: number;
    threshold?: number;
  }
): ChunkItem[] {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = Math.min(options?.overlap ?? DEFAULT_CHUNK_OVERLAP, chunkSize - 1);
  const threshold = options?.threshold ?? DEFAULT_CHUNK_THRESHOLD;

  if (content.length <= threshold) {
    return [{ text: content, chunk_index: 0, total_chunks: 1 }];
  }

  const chunks: ChunkItem[] = [];
  let start = 0;
  let index = 0;

  while (start < content.length) {
    const end = Math.min(start + chunkSize, content.length);
    const text = content.slice(start, end);
    chunks.push({ text, chunk_index: index, total_chunks: -1 });
    index++;
    start = end - overlap;
    if (start >= content.length) break;
  }

  const total = chunks.length;
  chunks.forEach((c) => (c.total_chunks = total));
  return chunks;
}
