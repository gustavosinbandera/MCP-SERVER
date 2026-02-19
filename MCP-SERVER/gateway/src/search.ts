/**
 * Search implementation with Qdrant
 */

import { QdrantClient } from '@qdrant/js-client-rest';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'mcp_docs';

export type SearchOptions = { project?: string };

export async function searchDocs(
  query: string,
  limit = 10,
  options?: SearchOptions
): Promise<{ results: Array<{ id: string; payload: Record<string, unknown> }>; total: number }> {
  const client = new QdrantClient({ url: QDRANT_URL });
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION);
    if (!exists) {
      return { results: [], total: 0 };
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
    const { points } = await client.scroll(COLLECTION, scrollOpts);
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
    throw new Error(`Search failed: ${msg}`);
  }
}

/**
 * Comprueba si ya existe un documento con el título dado en la colección mcp_docs.
 */
export async function existsDocWithTitle(title: string): Promise<boolean> {
  const client = new QdrantClient({ url: QDRANT_URL });
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION);
    if (!exists) return false;
    const { points } = await client.scroll(COLLECTION, {
      filter: { must: [{ key: 'title', match: { value: title } }] },
      limit: 1,
      with_payload: false,
      with_vector: false,
    });
    return points.length > 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`existsDocWithTitle failed: ${msg}`);
  }
}

/**
 * Comprueba si ya existe un documento con (project, source_path) en mcp_docs.
 * Permite tener el mismo path en distintos proyectos (ej. branch vs legacy).
 */
export async function existsDocByProjectAndPath(project: string, sourcePath: string): Promise<boolean> {
  const client = new QdrantClient({ url: QDRANT_URL });
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION);
    if (!exists) return false;
    const { points } = await client.scroll(COLLECTION, {
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
    throw new Error(`existsDocByProjectAndPath failed: ${msg}`);
  }
}

/**
 * Cuenta cuántos puntos (documentos) hay en la colección mcp_docs de Qdrant.
 */
export async function countDocs(): Promise<{ count: number; collection: string }> {
  const client = new QdrantClient({ url: QDRANT_URL });
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION);
    if (!exists) return { count: 0, collection: COLLECTION };
    const result = await client.count(COLLECTION, {});
    return { count: result.count ?? 0, collection: COLLECTION };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Count failed: ${msg}`);
  }
}
