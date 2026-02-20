/**
 * Inbox indexer: escanea una carpeta temporal (INDEX_INBOX_DIR), indexa cada
 * archivo/carpeta en Qdrant y elimina el elemento tras indexar correctamente.
 * Pensado para ser invocado por el supervisor de forma periódica.
 * Uses controlled parallelism (INDEX_CONCURRENCY) to avoid overloading OpenAI/Qdrant.
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID, createHash } from 'crypto';
import pLimit from 'p-limit';
import { QdrantClient } from '@qdrant/js-client-rest';
import {
  existsDocByProjectAndPath,
  loadExistingIndexedKeys,
  loadExistingIndexedKeysAndHashes,
  indexedKey,
  deleteByProjectAndTitle,
} from './search';
import { isPersistentIndexEnabled, addKey as addPersistentKey, removeKey as removePersistentKey } from './indexed-keys-db';
import { embedBatch, hasEmbedding, getVectorSize } from './embedding';
import { chunkText } from './chunking';
import { getQdrantClient } from './qdrant-client';
import {
  getInboxPath,
  getSharedDirsEntries,
  getSharedReindexChanged,
  getSharedSyncDeleted,
  COLLECTION_NAME,
  BATCH_UPSERT_SIZE,
  MAX_FILE_SIZE_BYTES,
  INDEX_CONCURRENCY,
} from './config';
import { info, error as logError } from './logger';

const TEXT_EXT = new Set([
  '.txt', '.md', '.json', '.csv', '.html', '.xml', '.log', '.yml', '.yaml',
  '.cpp', '.h', '.hpp', '.c', '.cc', '.cxx',
  '.js', '.ts', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.scala',
  '.sql', '.sh', '.bash', '.ps1',
]);

const BLOCKED_EXT = new Set([
  '.zip', '.rar', '.7z', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.z',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.msi', '.com',
  '.jar', '.war', '.class', '.o', '.obj', '.a', '.lib',
]);

/** Directorios que no se indexan por defecto. Evita node_modules, .git, etc. */
const DEFAULT_IGNORE_DIRS = new Set([
  '.git', '.svn', '.hg', '.idea', '.vscode', '.cursor',
  'node_modules', 'bower_components', 'jspm_packages',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  '.venv', 'venv', 'env', '.env',
  'dist', 'build', 'out', '.next', '.nuxt', '.output',
  'coverage', '.nyc_output', '.turbo', 'target',
  '.cache', 'tmp', 'temp', '.tmp', '.temp',
]);

function getIgnoreDirs(): Set<string> {
  const set = new Set(DEFAULT_IGNORE_DIRS);
  const raw = process.env.INDEX_IGNORE_DIRS?.trim();
  if (raw) {
    raw.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean).forEach((d) => set.add(d));
  }
  return set;
}

function isBlockedFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BLOCKED_EXT.has(ext);
}

function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXT.has(ext);
}

function readFileSafe(absPath: string): string | null {
  try {
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_SIZE_BYTES) return null;
    return fs.readFileSync(absPath, 'utf-8');
  } catch {
    return null;
  }
}

function* walkTextFiles(
  dirPath: string,
  baseDir: string = dirPath,
  ignoreDirs: Set<string> = getIgnoreDirs()
): Generator<{ relativePath: string; content: string }> {
  const names = fs.readdirSync(dirPath);
  for (const name of names) {
    const full = path.join(dirPath, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      if (!ignoreDirs.has(name.toLowerCase())) {
        yield* walkTextFiles(full, baseDir, ignoreDirs);
      }
    } else if (stat.isFile() && isTextFile(full)) {
      const content = readFileSafe(full);
      if (content != null) {
        const relativePath = path.relative(baseDir, full);
        yield { relativePath, content };
      }
    }
  }
}

async function ensureCollection(client: QdrantClient): Promise<void> {
  const collections = await client.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);
  if (!exists) {
    await client.createCollection(COLLECTION_NAME, {
      vectors: { size: getVectorSize(), distance: 'Cosine' },
    });
  }
}

function projectFromPath(sourcePath: string): string {
  const norm = sourcePath.replace(/\\/g, '/').trim();
  const first = norm.split('/')[0];
  return first || norm || 'inbox';
}

async function indexDocument(
  client: QdrantClient,
  title: string,
  content: string,
  meta?: { source_path: string; project: string }
): Promise<void> {
  const source_path = meta?.source_path ?? title;
  const project = meta?.project ?? '';

  if (hasEmbedding()) {
    const contentHash = createHash('sha256').update(content).digest('hex');
    const chunks = chunkText(content);
    const texts = chunks.map((c) => c.text);
    const vectors = await embedBatch(texts);
    const points: { id: string; vector: number[]; payload: Record<string, unknown> }[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const vector = vectors[i];
      if (vector == null) continue;
      const chunk = chunks[i];
      const payload: Record<string, unknown> = {
        title: source_path,
        content: chunk.text,
        source_path,
        project,
        chunk_index: chunk.chunk_index,
        total_chunks: chunk.total_chunks,
      };
      if (contentHash != null) payload.content_hash = contentHash;
      points.push({ id: randomUUID(), vector, payload });
    }
    if (points.length === 0) return;
    for (let i = 0; i < points.length; i += BATCH_UPSERT_SIZE) {
      const batch = points.slice(i, i + BATCH_UPSERT_SIZE);
      await client.upsert(COLLECTION_NAME, { wait: true, points: batch });
    }
    return;
  }

  const id = randomUUID();
  const payload: Record<string, unknown> = { title, content };
  if (meta) {
    payload.source_path = meta.source_path;
    payload.project = meta.project;
  }
  await client.upsert(COLLECTION_NAME, {
    wait: true,
    points: [{ id, vector: [0], payload }],
  });
}

function removeItemSync(absPath: string): void {
  const stat = fs.statSync(absPath);
  if (stat.isDirectory()) {
    fs.rmSync(absPath, { recursive: true });
  } else {
    fs.unlinkSync(absPath);
  }
}

/**
 * @param optionalInboxProject - Si está definido (ej. INDEX_INBOX_PROJECT), se usa como proyecto para no colisionar con otros árboles (branch/legacy).
 * @param existingKeys - Set pre-cargado de (project, source_path) ya indexados; si se pasa, se usa en lugar de existsDocByProjectAndPath y se actualiza al indexar.
 */
export async function processInboxItem(
  client: QdrantClient,
  absPath: string,
  topLevelName: string,
  optionalInboxProject?: string | null,
  existingKeys?: Set<string>
): Promise<{ indexed: number; removed: boolean }> {
  const stat = fs.statSync(absPath);
  const project = (optionalInboxProject && optionalInboxProject.trim()) || topLevelName;
  let indexed = 0;

  if (stat.isFile()) {
    if (isBlockedFile(absPath)) {
      removeItemSync(absPath);
      return { indexed: 0, removed: true };
    }
    if (!isTextFile(absPath)) return { indexed: 0, removed: false };
    const content = readFileSafe(absPath);
    if (content == null) return { indexed: 0, removed: false };
    const source_path = `${project}/${path.basename(absPath)}`.replace(/\/+/g, '/');
    if (existingKeys ? existingKeys.has(indexedKey(project, source_path)) : await existsDocByProjectAndPath(project, source_path)) {
      removeItemSync(absPath);
      return { indexed: 0, removed: true };
    }
    await indexDocument(client, source_path, content, { source_path, project });
    if (existingKeys) existingKeys.add(indexedKey(project, source_path));
    if (isPersistentIndexEnabled()) addPersistentKey(project, source_path, createHash('sha256').update(content).digest('hex'));
    indexed = 1;
    removeItemSync(absPath);
    return { indexed, removed: true };
  }

  if (stat.isDirectory()) {
    const items: { relativePath: string; content: string }[] = [];
    for (const item of walkTextFiles(absPath)) {
      items.push(item);
    }
    if (items.length === 0) {
      fs.rmSync(absPath, { recursive: true });
      return { indexed: 0, removed: true };
    }
    for (const { relativePath, content } of items) {
      const source_path = `${project}/${relativePath}`.replace(/\\/g, '/').replace(/\/+/g, '/');
      if (existingKeys ? existingKeys.has(indexedKey(project, source_path)) : await existsDocByProjectAndPath(project, source_path)) continue;
      await indexDocument(client, source_path, content, { source_path, project });
      if (existingKeys) existingKeys.add(indexedKey(project, source_path));
      if (isPersistentIndexEnabled()) addPersistentKey(project, source_path, createHash('sha256').update(content).digest('hex'));
      indexed++;
    }
    removeItemSync(absPath);
    return { indexed, removed: true };
  }

  return { indexed: 0, removed: false };
}

export async function processInbox(): Promise<{
  inboxPath: string;
  processed: number;
  indexed: number;
  errors: string[];
}> {
  const inboxPath = getInboxPath();
  const result = { inboxPath: inboxPath ?? '', processed: 0, indexed: 0, errors: [] as string[] };
  if (!inboxPath) return result;
  if (!fs.existsSync(inboxPath)) {
    try {
      fs.mkdirSync(inboxPath, { recursive: true });
    } catch (e) {
      result.errors.push(String(e));
      return result;
    }
  }
  let names: string[];
  try {
    names = fs.readdirSync(inboxPath);
  } catch (e) {
    result.errors.push(String(e));
    return result;
  }
  const inboxProject = (process.env.INDEX_INBOX_PROJECT || '').trim() || undefined;
  const client = getQdrantClient();
  await ensureCollection(client);
  const existingKeys = await loadExistingIndexedKeys(client);
  const limit = pLimit(INDEX_CONCURRENCY);
  const items = names.filter((n) => n !== '.' && n !== '..');
  const outcomes = await Promise.all(
    items.map((name) =>
      limit(async () => {
        const absPath = path.join(inboxPath, name);
        try {
          const { indexed, removed } = await processInboxItem(
            client,
            absPath,
            name,
            inboxProject,
            existingKeys
          );
          return { name, processed: 1, indexed, error: null as string | null };
        } catch (e) {
          return {
            name,
            processed: 0,
            indexed: 0,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      })
    )
  );
  for (const o of outcomes) {
    result.processed += o.processed;
    result.indexed += o.indexed;
    if (o.error) {
      result.errors.push(`${o.name}: ${o.error}`);
      logError('processInboxItem failed', { name: o.name, err: o.error });
    }
  }
  info('processInbox completed', { inboxPath, processed: result.processed, indexed: result.indexed, errors: result.errors.length });
  return result;
}

export function getInboxPathOrNull(): string | null {
  return getInboxPath();
}

/**
 * Indexa en Qdrant el contenido de los directorios en SHARED_DIRS.
 * Identidad por (proyecto + ruta): mismo path en otro proyecto no colisiona.
 * Con INDEX_SHARED_REINDEX_CHANGED reindexa archivos cuyo contenido cambió (hash).
 * Con INDEX_SHARED_SYNC_DELETED borra de Qdrant los (project, title) que ya no existen en disco.
 */
export async function indexSharedDirs(): Promise<{ indexed: number; errors: string[] }> {
  const entries = getSharedDirsEntries();
  const result = { indexed: 0, errors: [] as string[] };
  if (entries.length === 0) return result;
  const client = getQdrantClient();
  await ensureCollection(client);
  const needHashes = getSharedReindexChanged();
  const { keys: existingKeys, hashes: existingHashes } = await loadExistingIndexedKeysAndHashes(client);
  const limit = pLimit(INDEX_CONCURRENCY);
  for (const { project, path: root } of entries) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      result.errors.push(`SHARED_DIR no existe o no es carpeta: ${root} (proyecto: ${project})`);
      continue;
    }
    const files: { relativePath: string; content: string }[] = [];
    try {
      for (const item of walkTextFiles(root, root)) files.push(item);
    } catch (e) {
      result.errors.push(`${project}:${root}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const norm = (rp: string) => `${project}/${rp}`.replace(/\\/g, '/').replace(/\/+/g, '/');
    const currentOnDisk = new Set(files.map((f) => indexedKey(project, norm(f.relativePath))));
    const toIndex: { relativePath: string; content: string; source_path: string; key: string; hash: string }[] = [];
    const toReindex: { relativePath: string; content: string; source_path: string; key: string; hash: string }[] = [];
    for (const f of files) {
      const source_path = norm(f.relativePath);
      const key = indexedKey(project, source_path);
      const hash = createHash('sha256').update(f.content).digest('hex');
      if (!existingKeys.has(key)) {
        toIndex.push({ ...f, source_path, key, hash });
      } else if (needHashes && existingHashes.get(key) !== hash) {
        toReindex.push({ ...f, source_path, key, hash });
      }
    }
    const reindexCounts = await Promise.all(
      toReindex.map((item) =>
        limit(async () => {
          await deleteByProjectAndTitle(client, project, item.source_path);
          await indexDocument(client, item.source_path, item.content, { source_path: item.source_path, project });
          existingKeys.add(item.key);
          existingHashes.set(item.key, item.hash);
          if (isPersistentIndexEnabled()) addPersistentKey(project, item.source_path, item.hash);
          return 1;
        })
      )
    );
    result.indexed += reindexCounts.reduce((a, b) => a + b, 0);
    const counts = await Promise.all(
      toIndex.map((item) =>
        limit(async () => {
          await indexDocument(client, item.source_path, item.content, { source_path: item.source_path, project });
          existingKeys.add(item.key);
          existingHashes.set(item.key, item.hash);
          if (isPersistentIndexEnabled()) addPersistentKey(project, item.source_path, item.hash);
          return 1;
        })
      )
    );
    result.indexed += counts.reduce((a, b) => a + b, 0);
    if (getSharedSyncDeleted()) {
      const prefix = project + '\0';
      const keysForProject = [...existingKeys].filter((k) => k.startsWith(prefix));
      const toDelete = keysForProject.filter((k) => !currentOnDisk.has(k));
      for (const key of toDelete) {
        const title = key.slice(prefix.length);
        await limit(async () => {
          await deleteByProjectAndTitle(client, project, title);
          existingKeys.delete(key);
          existingHashes.delete(key);
          if (isPersistentIndexEnabled()) removePersistentKey(project, title);
          return 0;
        });
      }
    }
  }
  info('indexSharedDirs completed', { indexed: result.indexed, errors: result.errors.length });
  return result;
}
