/**
 * Inbox indexer: escanea una carpeta temporal (INDEX_INBOX_DIR), indexa cada
 * archivo/carpeta en Qdrant y elimina el elemento tras indexar correctamente.
 * Pensado para ser invocado por el supervisor de forma periódica.
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { QdrantClient } from '@qdrant/js-client-rest';
import { existsDocWithTitle, existsDocByProjectAndPath } from './search';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'mcp_docs';

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

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB por archivo

function isBlockedFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BLOCKED_EXT.has(ext);
}

function getInboxPath(): string {
  const raw = process.env.INDEX_INBOX_DIR;
  if (raw && raw.trim()) return path.resolve(raw.trim());
  const defaultInbox = path.resolve(__dirname, '..', '..', 'INDEX_INBOX');
  return defaultInbox;
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
  baseDir: string = dirPath
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
      yield* walkTextFiles(full, baseDir);
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
  const exists = collections.collections.some((c) => c.name === COLLECTION);
  if (!exists) {
    await client.createCollection(COLLECTION, {
      vectors: { size: 1, distance: 'Cosine' },
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
  const id = randomUUID();
  const payload: Record<string, unknown> = { title, content };
  if (meta) {
    payload.source_path = meta.source_path;
    payload.project = meta.project;
  }
  await client.upsert(COLLECTION, {
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
 */
export async function processInboxItem(
  client: QdrantClient,
  absPath: string,
  topLevelName: string,
  optionalInboxProject?: string | null
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
    if (await existsDocByProjectAndPath(project, source_path)) {
      removeItemSync(absPath);
      return { indexed: 0, removed: true };
    }
    await indexDocument(client, source_path, content, { source_path, project });
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
      if (await existsDocByProjectAndPath(project, source_path)) continue;
      await indexDocument(client, source_path, content, { source_path, project });
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
  const client = new QdrantClient({ url: QDRANT_URL } as { url: string; checkCompatibility?: boolean });
  await ensureCollection(client);
  for (const name of names) {
    if (name === '.' || name === '..') continue;
    const absPath = path.join(inboxPath, name);
    try {
      const { indexed, removed } = await processInboxItem(client, absPath, name, inboxProject);
      result.processed++;
      result.indexed += indexed;
    } catch (e) {
      result.errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

export function getInboxPathOrNull(): string | null {
  return getInboxPath();
}

/**
 * Rutas de directorios compartidos (SHARED_DIRS).
 * Formato: "proyecto:ruta" o solo "ruta" (entonces proyecto = nombre de la carpeta).
 * Ejemplo: BlueIvory-main:D:/repos/main;BlueIvory-legacy:D:/repos/legacy
 */
function getSharedDirsEntries(): { project: string; path: string }[] {
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
 * Indexa en Qdrant el contenido de los directorios en SHARED_DIRS.
 * Identidad por (proyecto + ruta): mismo path en otro proyecto no colisiona.
 */
export async function indexSharedDirs(): Promise<{ indexed: number; errors: string[] }> {
  const entries = getSharedDirsEntries();
  const result = { indexed: 0, errors: [] as string[] };
  if (entries.length === 0) return result;
  const client = new QdrantClient({ url: QDRANT_URL } as { url: string; checkCompatibility?: boolean });
  await ensureCollection(client);
  for (const { project, path: root } of entries) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      result.errors.push(`SHARED_DIR no existe o no es carpeta: ${root} (proyecto: ${project})`);
      continue;
    }
    try {
      for (const { relativePath, content } of walkTextFiles(root, root)) {
        const source_path = `${project}/${relativePath}`.replace(/\\/g, '/').replace(/\/+/g, '/');
        if (await existsDocByProjectAndPath(project, source_path)) continue;
        await indexDocument(client, source_path, content, { source_path, project });
        result.indexed++;
      }
    } catch (e) {
      result.errors.push(`${project}:${root}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}
