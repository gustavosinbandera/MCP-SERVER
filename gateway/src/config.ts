/**
 * Centralized config: env-derived values and shared constants.
 * Single source of truth for Qdrant URL, collection name, paths, and batch/chunk limits.
 */
import * as path from 'path';

export const QDRANT_URL = (process.env.QDRANT_URL || 'http://localhost:6333').trim();
export const COLLECTION_NAME = 'mcp_docs';

/** Max size per file for indexing (bytes). */
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

/** Batch size for Qdrant upsert. */
export const BATCH_UPSERT_SIZE = 50;

/** Max concurrent index operations (inbox items or shared-dir files). From INDEX_CONCURRENCY. */
export const INDEX_CONCURRENCY = Math.min(
  Math.max(1, Math.floor(Number(process.env.INDEX_CONCURRENCY) || 5)),
  20
);

/**
 * Inbox directory for items to be indexed (supervisor consumes and deletes).
 * Resolved from INDEX_INBOX_DIR or default relative to gateway.
 */
export function getInboxPath(): string {
  const raw = process.env.INDEX_INBOX_DIR;
  if (raw && raw.trim()) return path.resolve(raw.trim());
  return path.resolve(__dirname, '..', '..', 'INDEX_INBOX');
}

/**
 * Parsed SHARED_DIRS entries: project + absolute path.
 * Format: "proyecto:ruta" or "ruta" (project = folder name).
 */
export function getSharedDirsEntries(): { project: string; path: string }[] {
  const raw = process.env.SHARED_DIRS;
  if (!raw || !raw.trim()) return [];
  return raw
    .split(/[;|]/)
    .map((part) => part.trim())
    .filter((p) => p.length > 0)
    .map((part) => {
      const colon = part.indexOf(':');
      if (colon > 0) {
        const project = part.slice(0, colon).trim();
        const dirPath = path.resolve(part.slice(colon + 1).trim());
        return { project: project || path.basename(dirPath) || 'shared', path: dirPath };
      }
      const dirPath = path.resolve(part);
      return { project: path.basename(dirPath) || 'shared', path: dirPath };
    });
}

/**
 * Absolute roots only (for list/read in shared-dirs).
 * One root per entry in SHARED_DIRS (path part after optional "proyecto:").
 */
export function getSharedRoots(): string[] {
  return getSharedDirsEntries().map((e) => e.path).filter((p) => p.length > 0);
}

/** Si true, en indexSharedDirs se reindexan archivos cuyo contenido cambió (por hash). */
export function getSharedReindexChanged(): boolean {
  const v = process.env.INDEX_SHARED_REINDEX_CHANGED?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Si true, en indexSharedDirs se borran de Qdrant los (project, title) que ya no existen en disco. */
export function getSharedSyncDeleted(): boolean {
  const v = process.env.INDEX_SHARED_SYNC_DELETED?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Ruta del archivo SQLite para el índice persistente de claves (project, source_path). */
export function getIndexedKeysDbPath(): string {
  const raw = process.env.INDEXED_KEYS_DB?.trim();
  if (raw) return path.resolve(raw);
  return path.resolve(__dirname, '..', 'data', 'indexed_keys.db');
}

/** Si true, se usa el índice persistente SQLite en lugar del scroll completo de Qdrant. */
export function getUsePersistentIndexedKeys(): boolean {
  const v = process.env.INDEX_USE_PERSISTENT_KEYS?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
