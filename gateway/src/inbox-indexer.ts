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
  getPointsByProjectAndTitle,
} from './search';
import { isPersistentIndexEnabled, addKey as addPersistentKey, removeKey as removePersistentKey } from './indexed-keys-db';
import { embedBatch, hasEmbedding, getVectorSize, getEmbeddingConfig } from './embedding';
import { chunkText } from './chunking';
import { chunkCode, isCodeFileForChunking } from './code-chunking';
import { getQdrantClient } from './qdrant-client';
import {
  getInboxPath,
  getSharedDirsEntries,
  getSharedDirsOnce,
  getSharedReindexChanged,
  getSharedSyncDeleted,
  getRequireEmbeddings,
  getBranchForProject,
  getDomainForPath,
  COLLECTION_NAME,
  BATCH_UPSERT_SIZE,
  MAX_FILE_SIZE_BYTES,
  INDEX_CONCURRENCY,
} from './config';
import { loadOneTimeIndexedProjects, addOneTimeIndexedProject } from './one-time-indexed-db';
import { info, error as logError } from './logger';
import { extractCodeMetadata, isCodeFileForMetadata, type CodeMetadata } from './code-metadata';

const TEXT_EXT = new Set([
  '.txt', '.md', '.json', '.csv', '.html', '.xml', '.log', '.yml', '.yaml',
  '.cpp', '.h', '.hpp', '.c', '.cc', '.cxx',
  '.cs', '.cshtml', '.razor',
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

function assertEmbeddingsReady(context: 'inbox' | 'shared'): void {
  if (getRequireEmbeddings() && !hasEmbedding()) {
    throw new Error(`[${context}] INDEX_REQUIRE_EMBEDDINGS=true and OPENAI_API_KEY is missing. Indexing blocked.`);
  }
}

function projectFromPath(sourcePath: string): string {
  const norm = sourcePath.replace(/\\/g, '/').trim();
  const first = norm.split('/')[0];
  return first || norm || 'inbox';
}

type IndexDocumentMeta = {
  source_path: string;
  project: string;
  source_type?: 'code' | 'doc';
  branch?: string;
  domain?: string;
  code_metadata?: CodeMetadata | null;
};

async function indexDocument(
  client: QdrantClient,
  title: string,
  content: string,
  meta?: IndexDocumentMeta
): Promise<void> {
  const source_path = meta?.source_path ?? title;
  const project = meta?.project ?? '';

  if (hasEmbedding()) {
    const contentHash = createHash('sha256').update(content).digest('hex');
    const fileName = path.basename(source_path);
    const chunks = isCodeFileForChunking(fileName)
      ? chunkCode(content, fileName)
      : chunkText(content);
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
      if (meta?.source_type) payload.source_type = meta.source_type;
      if (meta?.branch) payload.branch = meta.branch;
      if (meta?.domain) payload.domain = meta.domain;
      if (meta?.code_metadata) {
        payload.file_name = meta.code_metadata.file_name;
        payload.class_names = meta.code_metadata.class_names;
        payload.property_names = meta.code_metadata.property_names;
        payload.referenced_types = meta.code_metadata.referenced_types;
      }
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
    if (meta.source_type) payload.source_type = meta.source_type;
    if (meta.branch) payload.branch = meta.branch;
    if (meta.domain) payload.domain = meta.domain;
    if (meta.code_metadata) {
      payload.file_name = meta.code_metadata.file_name;
      payload.class_names = meta.code_metadata.class_names;
      payload.property_names = meta.code_metadata.property_names;
      payload.referenced_types = meta.code_metadata.referenced_types;
    }
  }
  await client.upsert(COLLECTION_NAME, {
    wait: true,
    points: [{ id, vector: [0], payload }],
  });
}

/**
 * Reindexa un documento reutilizando vectores de chunks sin cambios (solo embed del diff).
 * oldPoints = puntos actuales del documento en Qdrant (con vector y payload.content).
 * Chunks con el mismo contenido (hash) reutilizan el vector; solo se llama a la API para chunks nuevos o modificados.
 */
async function indexDocumentReindexWithDiff(
  client: QdrantClient,
  content: string,
  meta: IndexDocumentMeta,
  oldPoints: Array<{ id: string; vector: number[]; payload: { content?: string } }>
): Promise<void> {
  const source_path = meta.source_path ?? '';
  const project = meta.project ?? '';
  const contentHash = createHash('sha256').update(content).digest('hex');
  const fileName = path.basename(source_path);
  const chunks = isCodeFileForChunking(fileName)
    ? chunkCode(content, fileName)
    : chunkText(content);

  const oldMap = new Map<string, number[]>();
  for (const p of oldPoints) {
    const c = p.payload?.content;
    if (typeof c === 'string' && c.length > 0) {
      const h = createHash('sha256').update(c).digest('hex');
      if (!oldMap.has(h)) oldMap.set(h, p.vector);
    }
  }

  const toEmbed: { index: number; text: string }[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i].text;
    const h = createHash('sha256').update(text).digest('hex');
    if (!oldMap.has(h)) toEmbed.push({ index: i, text });
  }

  const textsToEmbed = toEmbed.map((x) => x.text);
  const embedResults = textsToEmbed.length > 0 ? await embedBatch(textsToEmbed) : [];
  if (chunks.length > 0) {
    info('reindex with diff', {
      source_path,
      totalChunks: chunks.length,
      reusedChunks: chunks.length - toEmbed.length,
      embeddedChunks: toEmbed.length,
    });
  }

  const vectors: (number[] | null)[] = new Array(chunks.length);
  for (let k = 0; k < toEmbed.length; k++) {
    vectors[toEmbed[k].index] = embedResults[k] ?? null;
  }
  for (let i = 0; i < chunks.length; i++) {
    if (vectors[i] == null) {
      const h = createHash('sha256').update(chunks[i].text).digest('hex');
      vectors[i] = oldMap.get(h) ?? null;
    }
  }

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
    if (meta.source_type) payload.source_type = meta.source_type;
    if (meta.branch) payload.branch = meta.branch;
    if (meta.domain) payload.domain = meta.domain;
    if (meta.code_metadata) {
      payload.file_name = meta.code_metadata.file_name;
      payload.class_names = meta.code_metadata.class_names;
      payload.property_names = meta.code_metadata.property_names;
      payload.referenced_types = meta.code_metadata.referenced_types;
    }
    payload.content_hash = contentHash;
    points.push({ id: randomUUID(), vector, payload });
  }

  if (points.length === 0) return;

  await deleteByProjectAndTitle(client, project, source_path);
  for (let i = 0; i < points.length; i += BATCH_UPSERT_SIZE) {
    const batch = points.slice(i, i + BATCH_UPSERT_SIZE);
    await client.upsert(COLLECTION_NAME, { wait: true, points: batch });
  }
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
    const branch = getBranchForProject(project);
    const domain = getDomainForPath(project, path.basename(absPath));
    const fileName = path.basename(absPath);
    const code_metadata = isCodeFileForMetadata(fileName) ? extractCodeMetadata(content, fileName) : undefined;
    await indexDocument(client, source_path, content, { source_path, project, source_type: 'doc', branch, domain, code_metadata });
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
    const branch = getBranchForProject(project);
    for (const { relativePath, content } of items) {
      const source_path = `${project}/${relativePath}`.replace(/\\/g, '/').replace(/\/+/g, '/');
      if (existingKeys ? existingKeys.has(indexedKey(project, source_path)) : await existsDocByProjectAndPath(project, source_path)) continue;
      const domain = getDomainForPath(project, relativePath);
      const fileName = path.basename(relativePath);
      const code_metadata = isCodeFileForMetadata(fileName) ? extractCodeMetadata(content, fileName) : undefined;
      await indexDocument(client, source_path, content, { source_path, project, source_type: 'doc', branch, domain, code_metadata });
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
  const embeddingConfig = getEmbeddingConfig();
  assertEmbeddingsReady('inbox');
  info('processInbox starting', {
    inboxPath,
    embedding: embeddingConfig.apiKeySet ? 'enabled' : 'disabled',
    embeddingModel: embeddingConfig.apiKeySet ? embeddingConfig.model : undefined,
  });
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
export async function indexSharedDirs(): Promise<{ indexed: number; newCount: number; reindexedCount: number; errors: string[] }> {
  const allEntries = getSharedDirsEntries();
  const onceProjects = new Set(getSharedDirsOnce().map((p) => p.toLowerCase()));
  const oneTimeDone = loadOneTimeIndexedProjects();
  const entries = allEntries.filter((e) => {
    const key = e.project.toLowerCase();
    if (onceProjects.has(key) && oneTimeDone.has(key)) {
      return false;
    }
    return true;
  });
  const skippedOneTime = allEntries.filter((e) => {
    const key = e.project.toLowerCase();
    return onceProjects.has(key) && oneTimeDone.has(key);
  });
  const result = { indexed: 0, newCount: 0, reindexedCount: 0, errors: [] as string[] };
  if (allEntries.length === 0) return result;
  const embeddingConfig = getEmbeddingConfig();
  assertEmbeddingsReady('shared');
  info('indexSharedDirs starting', {
    projects: entries.map((e) => e.project),
    skippedOneTime: skippedOneTime.length > 0 ? skippedOneTime.map((e) => e.project) : undefined,
    oneTimeDone: onceProjects.size > 0 ? Array.from(oneTimeDone) : undefined,
    embedding: embeddingConfig.apiKeySet ? 'enabled' : 'disabled',
    embeddingModel: embeddingConfig.apiKeySet ? embeddingConfig.model : undefined,
  });
  if (skippedOneTime.length > 0) {
    info('indexSharedDirs skipping one-time-already-done', { projects: skippedOneTime.map((e) => e.project) });
  }
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
    const branch = getBranchForProject(project);
    const reindexCounts = await Promise.all(
      toReindex.map((item) =>
        limit(async () => {
          const domain = getDomainForPath(project, item.relativePath);
          const fileName = path.basename(item.relativePath);
          const code_metadata = isCodeFileForMetadata(fileName) ? extractCodeMetadata(item.content, fileName) : undefined;
          const meta: IndexDocumentMeta = {
            source_path: item.source_path,
            project,
            source_type: 'code',
            branch,
            domain,
            code_metadata,
          };
          if (hasEmbedding()) {
            const oldPoints = await getPointsByProjectAndTitle(client, project, item.source_path);
            await indexDocumentReindexWithDiff(client, item.content, meta, oldPoints);
          } else {
            await deleteByProjectAndTitle(client, project, item.source_path);
            await indexDocument(client, item.source_path, item.content, meta);
          }
          existingKeys.add(item.key);
          existingHashes.set(item.key, item.hash);
          if (isPersistentIndexEnabled()) addPersistentKey(project, item.source_path, item.hash);
          return 1;
        })
      )
    );
    const reindexed = reindexCounts.reduce((a, b) => a + b, 0);
    result.reindexedCount += reindexed;
    result.indexed += reindexed;
    const counts = await Promise.all(
      toIndex.map((item) =>
        limit(async () => {
          const domain = getDomainForPath(project, item.relativePath);
          const fileName = path.basename(item.relativePath);
          const code_metadata = isCodeFileForMetadata(fileName) ? extractCodeMetadata(item.content, fileName) : undefined;
          await indexDocument(client, item.source_path, item.content, { source_path: item.source_path, project, source_type: 'code', branch, domain, code_metadata });
          existingKeys.add(item.key);
          existingHashes.set(item.key, item.hash);
          if (isPersistentIndexEnabled()) addPersistentKey(project, item.source_path, item.hash);
          return 1;
        })
      )
    );
    const newCount = counts.reduce((a, b) => a + b, 0);
    result.newCount += newCount;
    result.indexed += newCount;
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
    if (onceProjects.has(project.toLowerCase())) {
      addOneTimeIndexedProject(project);
      oneTimeDone.add(project.toLowerCase());
      info('indexSharedDirs one-time complete', { project });
    }
  }
  info('indexSharedDirs completed', {
    indexed: result.indexed,
    newCount: result.newCount,
    reindexedCount: result.reindexedCount,
    errors: result.errors.length,
  });
  return result;
}
