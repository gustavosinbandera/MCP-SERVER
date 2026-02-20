/**
 * Search implementation with Qdrant (semantic when OpenAI is configured, else keyword).
 */
import * as fs from 'fs';
import { QdrantClient } from '@qdrant/js-client-rest';
import { embed, hasEmbedding } from './embedding';
import { getQdrantClient } from './qdrant-client';
import { COLLECTION_NAME, getIndexedKeysDbPath } from './config';
import { error as logError } from './logger';
import {
  isPersistentIndexEnabled,
  getKeysAndHashes as getPersistentKeysAndHashes,
  rebuildFromQdrant,
} from './indexed-keys-db';

/**
 * Filtros de búsqueda (alineados con el payload indexado en mcp_docs).
 * Payload: project, branch, source_type, domain, file_name, class_names[], property_names[], referenced_types[], title, content, source_path, url (si aplica).
 * branch y source_type se normalizan a minúsculas al filtrar.
 */
export type SearchOptions = {
  project?: string;
  branch?: string;
  source_type?: string;
  domain?: string;
  /** Filtrar por clase (documentos cuyo class_names contiene este valor). */
  class_name?: string;
  /** Filtrar por tipo referenciado (documentos cuyo referenced_types contiene este valor). */
  referenced_type?: string;
  /** Filtrar por nombre de archivo (coincidencia exacta en file_name). */
  file_name?: string;
};

type QdrantMustCondition =
  | { key: string; match: { value: string } }
  | { key: string; match: { any: string[] } };

function buildSearchFilter(options?: SearchOptions): { must: QdrantMustCondition[] } | undefined {
  if (!options) return undefined;
  const must: QdrantMustCondition[] = [];
  const add = (key: string, value: string) => {
    if (!value) return;
    must.push({ key, match: { value } });
  };
  if (options.project?.trim()) add('project', options.project.trim());
  if (options.branch?.trim()) must.push({ key: 'branch', match: { value: options.branch.trim().toLowerCase() } });
  if (options.source_type?.trim()) must.push({ key: 'source_type', match: { value: options.source_type.trim().toLowerCase() } });
  if (options.domain?.trim()) must.push({ key: 'domain', match: { value: options.domain.trim().toLowerCase() } });
  if (options.file_name?.trim()) add('file_name', options.file_name.trim());
  if (options.class_name?.trim()) must.push({ key: 'class_names', match: { any: [options.class_name.trim()] } });
  if (options.referenced_type?.trim()) must.push({ key: 'referenced_types', match: { any: [options.referenced_type.trim()] } });
  return must.length > 0 ? { must } : undefined;
}

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
  const { keys } = await loadExistingIndexedKeysAndHashes(client);
  return keys;
}

/**
 * Loads (project, title) keys and optional content_hash per key.
 * When INDEX_USE_PERSISTENT_KEYS is set, uses SQLite; otherwise (or if DB missing) scrolls Qdrant.
 * On first run with persistent keys, rebuilds SQLite from Qdrant and returns that result.
 */
export async function loadExistingIndexedKeysAndHashes(client: QdrantClient): Promise<{
  keys: Set<string>;
  hashes: Map<string, string>;
}> {
  if (isPersistentIndexEnabled() && fs.existsSync(getIndexedKeysDbPath())) {
    try {
      return getPersistentKeysAndHashes();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError('loadExistingIndexedKeysAndHashes from SQLite failed, falling back to Qdrant', { err: msg });
    }
  }

  const keys = new Set<string>();
  const hashes = new Map<string, string>();
  let offset: string | number | Record<string, unknown> | null | undefined = undefined;
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);
    if (!exists) return { keys, hashes };

    for (;;) {
      const { points, next_page_offset } = await client.scroll(COLLECTION_NAME, {
        limit: SCROLL_PAGE_SIZE,
        offset,
        with_payload: { include: ['project', 'title', 'content_hash'] },
        with_vector: false,
      });
      for (const p of points) {
        const payload = p.payload as { project?: string; title?: string; content_hash?: string } | undefined;
        const project = payload?.project ?? '';
        const title = payload?.title ?? '';
        if (project || title) {
          const key = indexedKey(project, title);
          keys.add(key);
          const h = payload?.content_hash;
          if (typeof h === 'string' && h && !hashes.has(key)) hashes.set(key, h);
        }
      }
      if (next_page_offset == null) break;
      offset = next_page_offset;
    }

    if (isPersistentIndexEnabled()) {
      try {
        await rebuildFromQdrant(client);
      } catch (e) {
        logError('rebuildFromQdrant after scroll failed', { err: e instanceof Error ? e.message : String(e) });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('loadExistingIndexedKeysAndHashes failed', { err: msg });
    throw new Error(`loadExistingIndexedKeysAndHashes failed: ${msg}`);
  }
  return { keys, hashes };
}

/**
 * Deletes all points in the collection with the given project and title (source_path).
 * Used when reindexing or syncing deleted files in SHARED_DIRS.
 */
export async function deleteByProjectAndTitle(
  client: QdrantClient,
  project: string,
  title: string
): Promise<void> {
  await client.delete(COLLECTION_NAME, {
    filter: {
      must: [
        { key: 'project', match: { value: project } },
        { key: 'title', match: { value: title } },
      ],
    },
  });
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
        const filter = buildSearchFilter(options);
        if (filter) searchOpts.filter = filter;
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
    const filter = buildSearchFilter(options);
    if (filter) scrollOpts.filter = filter;
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
