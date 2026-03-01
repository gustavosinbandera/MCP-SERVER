/**
 * Centralized config: env-derived values and shared constants.
 * Single source of truth for Qdrant URL, collection name, paths, and batch/chunk limits.
 */
import * as path from 'path';

export const QDRANT_URL = (process.env.QDRANT_URL || 'http://localhost:6333').trim();
export const COLLECTION_NAME = 'mcp_docs';

/** Max size per file for indexing (bytes). Also used for upload per-file limit. */
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

/** Max number of files per upload request (inbox or KB). From MAX_UPLOAD_FILES env or default 50. */
export const MAX_UPLOAD_FILES = Math.min(
  Math.max(1, Math.floor(Number(process.env.MAX_UPLOAD_FILES) || 50)),
  500
);

/** Max total bytes per upload request. From MAX_UPLOAD_TOTAL_BYTES env or default 20 MB. */
export const MAX_UPLOAD_TOTAL_BYTES = Math.min(
  Math.max(MAX_FILE_SIZE_BYTES, Math.floor(Number(process.env.MAX_UPLOAD_TOTAL_BYTES) || 20 * 1024 * 1024)),
  100 * 1024 * 1024
);

/** Batch size for Qdrant upsert. */
export const BATCH_UPSERT_SIZE = 50;

/** Max concurrent index operations (inbox items or shared-dir files). From INDEX_CONCURRENCY. */
export const INDEX_CONCURRENCY = Math.min(
  Math.max(1, Math.floor(Number(process.env.INDEX_CONCURRENCY) || 5)),
  20
);

/** Project root (parent of gateway/). Used to resolve relative paths in SHARED_DIRS. */
export function getProjectRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

/**
 * Root directory for the file explorer API (GET /files/list).
 * Resolved from FILES_EXPLORER_ROOT or default: project root.
 * The UI can only list paths under this root.
 */
export function getFilesExplorerRoot(): string {
  const raw = process.env.FILES_EXPLORER_ROOT?.trim();
  if (raw) return path.resolve(raw);
  return getProjectRoot();
}

/**
 * Inbox directory for items to be indexed (supervisor consumes and deletes).
 * Resolved from INDEX_INBOX_DIR or default: project root / INDEX_INBOX.
 * Alias: ADMIN_INBOX_DIR sin romper compatibilidad.
 */
export function getInboxPath(): string {
  const raw = process.env.INDEX_INBOX_DIR || process.env.ADMIN_INBOX_DIR;
  if (raw && raw.trim()) return path.resolve(raw.trim());
  return path.join(getProjectRoot(), 'INDEX_INBOX');
}

/**
 * Root directory for User KB: persistent Markdown per user (indexed, not deleted).
 * Resolved from USER_KB_ROOT_DIR or default: /app/USER_KB (Docker) or project root / USER_KB (local).
 */
export function getUserKbRootDir(): string {
  const raw = process.env.USER_KB_ROOT_DIR;
  if (raw && raw.trim()) return path.resolve(raw.trim());
  return path.join(getProjectRoot(), 'USER_KB');
}

/** Directory for a given user's KB: USER_KB_ROOT_DIR/<userId>. */
export function getUserKbUserDir(userId: string): string {
  const root = getUserKbRootDir();
  const safe = (userId || 'local').replace(/[<>:"/\\|?*]/g, '_').trim() || 'local';
  return path.join(root, safe);
}

/**
 * Parsed SHARED_DIRS entries: project + absolute path.
 * Format: "project:path" or "path" (project = folder name).
 * Relative paths (e.g. classic, blueivory) are resolved against project root.
 */
export function getSharedDirsEntries(): { project: string; path: string }[] {
  const raw = process.env.SHARED_DIRS;
  if (!raw || !raw.trim()) return [];
  const projectRoot = getProjectRoot();
  return raw
    .split(/[;|]/)
    .map((part) => part.trim())
    .filter((p) => p.length > 0)
    .map((part) => {
      const colon = part.indexOf(':');
      if (colon > 0) {
        const project = part.slice(0, colon).trim();
        const rawPath = part.slice(colon + 1).trim();
        const dirPath = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.join(projectRoot, rawPath);
        return { project: project || path.basename(dirPath) || 'shared', path: dirPath };
      }
      const rawPath = part;
      const dirPath = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.join(projectRoot, rawPath);
      return { project: path.basename(dirPath) || 'shared', path: dirPath };
    });
}

/**
 * Absolute roots only (for list/read in shared-dirs).
 * One root per entry in SHARED_DIRS (path part after optional "project:").
 */
export function getSharedRoots(): string[] {
  return getSharedDirsEntries().map((e) => e.path).filter((p) => p.length > 0);
}

/** If true, indexSharedDirs re-indexes files whose content changed (by hash). */
export function getSharedReindexChanged(): boolean {
  const v = process.env.INDEX_SHARED_REINDEX_CHANGED?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** If true, indexSharedDirs deletes from Qdrant any (project, title) that no longer exists on disk. */
export function getSharedSyncDeleted(): boolean {
  const v = process.env.INDEX_SHARED_SYNC_DELETED?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Projects that are indexed only once (e.g. classic, blueivory).
 * After a successful cycle, they are persisted and won't be indexed again even after a restart.
 * Format: SHARED_DIRS_ONCE=classic;blueivory
 */
export function getSharedDirsOnce(): string[] {
  const raw = process.env.SHARED_DIRS_ONCE?.trim();
  if (!raw) return [];
  return raw.split(/[;|,]/).map((p) => p.trim().toLowerCase()).filter(Boolean);
}

/** SQLite file path that persists projects already indexed once (avoids re-indexing). */
export function getOneTimeIndexedDbPath(): string {
  const raw = process.env.ONE_TIME_INDEXED_DB?.trim();
  if (raw) return path.resolve(raw);
  return path.resolve(__dirname, '..', 'data', 'one_time_indexed.db');
}

/** SQLite file path for persistent key index (project, source_path). */
export function getIndexedKeysDbPath(): string {
  const raw = process.env.INDEXED_KEYS_DB?.trim();
  if (raw) return path.resolve(raw);
  return path.resolve(__dirname, '..', 'data', 'indexed_keys.db');
}

/** SQLite file path for User KB indexed (owner_user_id, source_path) + content_hash. */
export function getUserKbIndexedDbPath(): string {
  const raw = process.env.USER_KB_INDEXED_DB?.trim();
  if (raw) return path.resolve(raw);
  return path.resolve(__dirname, '..', 'data', 'user_kb_indexed.db');
}

/** SQLite file path for per-day indexing stats (INDEX_STATS_DB). */
export function getIndexingStatsDbPath(): string {
  const raw = process.env.INDEX_STATS_DB?.trim();
  if (raw) return path.resolve(raw);
  return path.resolve(__dirname, '..', 'data', 'indexing_stats.db');
}

/** SQLite file path for KB upload records (KB_UPLOADS_DB). */
export function getKbUploadsDbPath(): string {
  const raw = process.env.KB_UPLOADS_DB?.trim();
  if (raw) return path.resolve(raw);
  return path.resolve(__dirname, '..', 'data', 'kb_uploads.db');
}

/** If true, use the persistent SQLite index instead of a full Qdrant scroll. */
export function getUsePersistentIndexedKeys(): boolean {
  const v = process.env.INDEX_USE_PERSISTENT_KEYS?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** If true, indexing is blocked unless embeddings are enabled (OPENAI_API_KEY set). */
export function getRequireEmbeddings(): boolean {
  const v = process.env.INDEX_REQUIRE_EMBEDDINGS?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Project aliases that map to branch "classic" (case-insensitive). */
const CLASSIC_ALIASES = ['classic', 'clasic', 'core'];

/** Project aliases that map to branch "blueivory" (case-insensitive). */
const BLUEIVORY_ALIASES = ['bi', 'blueivory', 'blue-ivory'];

/**
 * Branch (classic vs blueivory) for a given project name.
 * Uses BRANCH_PROJECTS env (format "classic:proj1,proj2;blueivory:proj3") or alias/convention:
 * - Classic: project is or contains "classic", "clasic", "core"
 * - BlueIvory: project is or contains "bi", "blueivory", "blue-ivory", or starts with "bi-" / "bi_"
 */
export function getBranchForProject(project: string): string | undefined {
  const raw = process.env.BRANCH_PROJECTS?.trim();
  if (raw) {
    const lower = project.toLowerCase();
    for (const part of raw.split(';')) {
      const colon = part.indexOf(':');
      if (colon > 0) {
        const branch = part.slice(0, colon).trim().toLowerCase();
        const projects = part.slice(colon + 1).split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
        if (branch && projects.some((p) => lower === p || lower.includes(p))) return branch;
      }
    }
  }
  const p = project.toLowerCase();
  if (CLASSIC_ALIASES.some((a) => p === a || p.includes(a))) return 'classic';
  if (BLUEIVORY_ALIASES.some((a) => p === a || p.includes(a))) return 'blueivory';
  if (/^bi[-_]/.test(p)) return 'blueivory';
  return undefined;
}

/**
 * Domain inferred from project name or path (e.g. accounting, shipments, warehouse).
 * Uses DOMAIN_KEYWORDS env: "domain:keyword1,keyword2;..." (path/project containing keyword → domain).
 * Example: DOMAIN_KEYWORDS=accounting:accounting,account;shipments:shipment,shipping;warehouse:warehouse,wr,receipt
 */
export function getDomainForPath(project: string, relativePath: string): string | undefined {
  const raw = process.env.DOMAIN_KEYWORDS?.trim();
  if (!raw) return undefined;
  const combined = `${project}/${relativePath}`.toLowerCase();
  for (const part of raw.split(';')) {
    const colon = part.indexOf(':');
    if (colon > 0) {
      const domain = part.slice(0, colon).trim().toLowerCase();
      const keywords = part.slice(colon + 1).split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
      if (domain && keywords.some((kw) => combined.includes(kw))) return domain;
    }
  }
  return undefined;
}
