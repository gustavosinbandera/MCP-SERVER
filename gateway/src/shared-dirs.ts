/**
 * Shared directories without indexing.
 * The MCP client can list and read files within paths configured in SHARED_DIRS.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getSharedRoots } from './config';

const SEP = path.sep;

function isInsideRoot(resolved: string, root: string): boolean {
  const nRes = path.normalize(resolved);
  const nRootNoSep = path.normalize(root).replace(/[/\\]+$/, '');
  const nRootWithSep = nRootNoSep + SEP;
  return nRes === nRootNoSep || nRes === nRootWithSep || nRes.startsWith(nRootWithSep);
}

function resolveUnderRoots(relativePath: string): { root: string; absolute: string } | null {
  const roots = getSharedRoots();
  if (roots.length === 0) return null;
  const root = roots[0];
  const joined = path.join(root, relativePath || '.');
  const resolved = path.resolve(joined);
  if (!isInsideRoot(resolved, root)) return null;
  return { root, absolute: resolved };
}

/**
 * List directories and files for a relative path under the first shared directory.
 * @param relativePath - Relative path (e.g. "" or "subfolder"). Empty = shared root.
 */
export function listSharedDir(relativePath: string = ''): { entries: string[]; root: string } | null {
  const roots = getSharedRoots();
  if (roots.length === 0) return null;
  const root = roots[0];
  const info = resolveUnderRoots(relativePath);
  if (!info) return null;
  try {
    const stat = fs.statSync(info.absolute);
    if (!stat.isDirectory()) return { entries: [], root };
    const names = fs.readdirSync(info.absolute);
    const entries = names.map((name) => {
      const full = path.join(info.absolute, name);
      const s = fs.statSync(full);
      return s.isDirectory() ? `${name}/` : name;
    });
    return { entries: entries.sort(), root };
  } catch {
    return null;
  }
}

/**
 * Read a file content by a path relative to the shared directory.
 * @param relativePath - Relative file path (e.g. "readme.txt" or "src/index.js").
 */
export function readSharedFile(relativePath: string): { content: string; path: string } | null {
  const info = resolveUnderRoots(relativePath);
  if (!info) return null;
  try {
    const stat = fs.statSync(info.absolute);
    if (!stat.isFile()) return null;
    const content = fs.readFileSync(info.absolute, 'utf-8');
    return { content, path: info.absolute };
  } catch {
    return null;
  }
}

export function getSharedRootsForDisplay(): string[] {
  return getSharedRoots();
}
