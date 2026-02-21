/**
 * Búsqueda de código relevante para un bug (título + descripción).
 * Extrae palabras clave y busca en gateway/src archivos que las contengan.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getProjectRoot } from './config';

const DEFAULT_MAX_FILES = 8;
const DEFAULT_MAX_CHARS_PER_FILE = 6000;
const MIN_KEYWORD_LEN = 3;

/** Fragmento de código: ruta relativa y contenido (truncado). */
export interface CodeSnippet {
  path: string;
  content: string;
}

/**
 * Extrae palabras clave del texto (alfanuméricos, longitud >= MIN_KEYWORD_LEN).
 */
function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.split(/[\s\-_.,;:()\[\]{}'"]+/).filter((w) => w.length >= MIN_KEYWORD_LEN);
  return [...new Set(words)];
}

/**
 * Lista recursiva de archivos .ts y .js en un directorio (solo .ts en src para evitar dist).
 */
function listSourceFiles(dir: string, ext: string): string[] {
  const out: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'dist') {
        out.push(...listSourceFiles(full, ext));
      } else if (e.isFile() && e.name.endsWith(ext)) {
        out.push(full);
      }
    }
  } catch {
    // ignore
  }
  return out;
}

/**
 * Devuelve archivos de gateway/src (y opcionalmente raíz del repo) cuyo contenido
 * o path contenga alguna palabra clave del bug. Ordenados por número de coincidencias.
 * Limita número de archivos y caracteres por archivo para caber en contexto LLM.
 */
export function findRelevantCode(
  bugTitle: string,
  bugDescription: string,
  options?: { maxFiles?: number; maxCharsPerFile?: number }
): CodeSnippet[] {
  const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES;
  const maxCharsPerFile = options?.maxCharsPerFile ?? DEFAULT_MAX_CHARS_PER_FILE;
  const text = `${bugTitle} ${bugDescription}`;
  const keywords = extractKeywords(text);
  if (keywords.length === 0) return [];

  const projectRoot = getProjectRoot();
  const gatewaySrc = path.join(projectRoot, 'gateway', 'src');
  const files = listSourceFiles(gatewaySrc, '.ts');

  const scored: { path: string; fullPath: string; score: number }[] = [];
  for (const fullPath of files) {
    const relPath = path.relative(projectRoot, fullPath);
    const pathLower = relPath.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (pathLower.includes(kw)) score += 2;
    }
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const contentLower = content.toLowerCase();
      for (const kw of keywords) {
        if (contentLower.includes(kw)) score += 1;
      }
      if (score > 0) scored.push({ path: relPath, fullPath, score });
    } catch {
      // skip unreadable
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const snippets: CodeSnippet[] = [];
  for (let i = 0; i < Math.min(maxFiles, scored.length); i++) {
    const { fullPath, path: relPath } = scored[i];
    try {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (content.length > maxCharsPerFile) {
        content = content.slice(0, maxCharsPerFile) + '\n// ... (truncado)';
      }
      snippets.push({ path: relPath, content });
    } catch {
      // skip
    }
  }
  return snippets;
}
