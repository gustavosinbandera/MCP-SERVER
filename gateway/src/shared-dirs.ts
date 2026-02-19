/**
 * Directorios compartidos sin indexar.
 * El cliente MCP puede listar y leer archivos dentro de las rutas configuradas en SHARED_DIRS.
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
 * Lista directorios y archivos en una ruta relativa dentro del primer directorio compartido.
 * @param relativePath - Ruta relativa (ej. "" o "subcarpeta"). Vacía = raíz del compartido.
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
 * Lee el contenido de un archivo por ruta relativa al directorio compartido.
 * @param relativePath - Ruta relativa al archivo (ej. "readme.txt" o "src/index.js").
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
