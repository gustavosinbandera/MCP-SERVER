/**
 * Search implementation with Qdrant (semantic when OpenAI is configured, else keyword).
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { embed, hasEmbedding } from './embedding';
import { getQdrantClient } from './qdrant-client';
import { COLLECTION_NAME } from './config';
import { error as logError } from './logger';

export type SearchOptions = { project?: string };

const SCROLL_PAGE_SIZE = 500;

/**
 * Builds a unique key for (project, source_path) for use in an indexed set.
 */
export function indexedKey(project: string, sourcePath: string): string {
  return project + '\0' + sourcePath;
}

/**
 * Loads all (project, title) pairs from the collection into a Set.
 * Used to avoid per-file existsDocByProjectAndPath round-trips during indexation.
 */
export async function loadExistingIndexedKeys(client: QdrantClient): Promise<Set<string>> {
  const keys = new Set<string>();
  let offset: string | number | Record<string, unknown> | null | undefined = undefined;
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);
    if (!exists) return keys;

    for (;;) {
      const { points, next_page_offset } = await client.scroll(COLLECTION_NAME, {
        limit: SCROLL_PAGE_SIZE,
        offset,
        with_payload: { include: ['project', 'title'] },
        with_vector: false,
      });
      for (const p of points) {
        const payload = p.payload as { project?: string; title?: string } | undefined;
        const project = payload?.project ?? '';
        const title = payload?.title ?? '';
        if (project || title) keys.add(indexedKey(project, title));
      }
      if (next_page_offset == null) break;
      offset = next_page_offset;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('loadExistingIndexedKeys failed', { err: msg });
    throw new Error(`loadExistingIndexedKeys failed: ${msg}`);
  }
  return keys;
}

export async function searchDocs(
  query: string,
  limit = 10,
  options?: SearchOptions
): Promise<{ results: Array<{ id: string; payload: Record<string, unknown>; score?: number }>; total: number }> {
  const client = getQdrantClient();
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);
    if (!exists) {
      return { results: [], total: 0 };
    }

    if (hasEmbedding() && query?.trim()) {
      const queryVector = await embed(query.trim());
      if (queryVector) {
        const searchOpts: Parameters<QdrantClient['search']>[1] = {
          vector: queryVector,
          limit: Math.min(limit, 100),
          with_payload: true,
          with_vector: false,
        };
        if (options?.project?.trim()) {
          searchOpts.filter = {
            must: [{ key: 'project', match: { value: options.project.trim() } }],
          };
        }
        const searchResult = await client.search(COLLECTION_NAME, searchOpts);
        const results = searchResult.map((p) => ({
          id: (p.id as string) ?? '',
          payload: (p.payload || {}) as Record<string, unknown>,
          score: p.score,
        }));
        return { results, total: results.length };
      }
    }

    const scrollOpts: Parameters<QdrantClient['scroll']>[1] = {
      limit: Math.min(limit, 100),
      with_payload: true,
      with_vector: false,
    };
    if (options?.project?.trim()) {
      scrollOpts.filter = {
        must: [{ key: 'project', match: { value: options.project.trim() } }],
      };
    }
    const { points } = await client.scroll(COLLECTION_NAME, scrollOpts);
    let results = points.map((p) => ({
      id: p.id as string,
      payload: (p.payload || {}) as Record<string, unknown>,
    }));
    if (query && query.trim()) {
      const q = query.toLowerCase();
      results = results.filter((r) => {
        const title = String((r.payload?.title as string) || '').toLowerCase();
        const content = String((r.payload?.content as string) || '').toLowerCase();
        return title.includes(q) || content.includes(q);
      });
    }
    return { results, total: results.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('Search failed', { err: msg });
    throw new Error(`Search failed: ${msg}`);
  }
}

/**
 * Comprueba si ya existe un documento con el título dado en la colección mcp_docs.
 */
export async function existsDocWithTitle(title: string): Promise<boolean> {
  const client = getQdrantClient();
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);
    if (!exists) return false;
    const { points } = await client.scroll(COLLECTION_NAME, {
      filter: { must: [{ key: 'title', match: { value: title } }] },
      limit: 1,
      with_payload: false,
      with_vector: false,
    });
    return points.length > 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('existsDocWithTitle failed', { err: msg });
    throw new Error(`existsDocWithTitle failed: ${msg}`);
  }
}

/**
 * Comprueba si ya existe un documento con (project, source_path) en mcp_docs.
 * Permite tener el mismo path en distintos proyectos (ej. branch vs legacy).
 */
export async function existsDocByProjectAndPath(project: string, sourcePath: string): Promise<boolean> {
  const client = getQdrantClient();
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);
    if (!exists) return false;
    const { points } = await client.scroll(COLLECTION_NAME, {
      filter: {
        must: [
          { key: 'project', match: { value: project } },
          { key: 'title', match: { value: sourcePath } },
        ],
      },
      limit: 1,
      with_payload: false,
      with_vector: false,
    });
    return points.length > 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('existsDocByProjectAndPath failed', { err: msg });
    throw new Error(`existsDocByProjectAndPath failed: ${msg}`);
  }
}

/**
 * Cuenta cuántos puntos (documentos) hay en la colección mcp_docs de Qdrant.
 */
export async function countDocs(): Promise<{ count: number; collection: string }> {
  const client = getQdrantClient();
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);
    if (!exists) return { count: 0, collection: COLLECTION_NAME };
    const result = await client.count(COLLECTION_NAME, {});
    return { count: result.count ?? 0, collection: COLLECTION_NAME };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('Count failed', { err: msg });
    throw new Error(`Count failed: ${msg}`);
  }
}
