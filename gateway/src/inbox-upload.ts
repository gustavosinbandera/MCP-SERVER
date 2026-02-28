/**
 * Helpers for inbox/KB upload: extension validation, path sanitization, file size.
 * Aligned with inbox-indexer (TEXT_EXT, BLOCKED_EXT, MAX_FILE_SIZE_BYTES).
 */
import * as path from 'path';
import { MAX_FILE_SIZE_BYTES } from './config';

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

/** True if filename has an allowed text extension and is not blocked (inbox upload). */
export function isAllowedExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return TEXT_EXT.has(ext) && !BLOCKED_EXT.has(ext);
}

/** True if filename has .md extension (for KB upload). */
export function isMdExtension(filename: string): boolean {
  return path.extname(filename).toLowerCase() === '.md';
}

/** Sanitize path: no .., no leading slash, safe chars only. Returns relative path with forward slashes. */
export function sanitizeUploadPath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') return '';
  let p = rawPath.replace(/\\/g, '/').trim();
  while (p.startsWith('/')) p = p.slice(1);
  const parts = p.split('/').filter((seg) => seg !== '' && seg !== '.');
  const out: string[] = [];
  for (const seg of parts) {
    if (seg === '..') continue;
    const safe = seg.replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/\s+/g, '_');
    if (safe.length) out.push(safe);
  }
  return out.join('/');
}

/** True if size is within limit (MAX_FILE_SIZE_BYTES). */
export function validateFileSize(size: number): boolean {
  return Number.isFinite(size) && size >= 0 && size <= MAX_FILE_SIZE_BYTES;
}
