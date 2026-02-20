/**
 * Code-aware chunking: split at function/class/directive boundaries
 * so we never cut in the middle of an unclosed block.
 * Uses a simple "expert" rule set (brace depth, #endif, #endregion)
 * to find safe split points within a size margin.
 */

import { chunkText, type ChunkItem } from './chunking';

/** Extensions that use braces and/or preprocessor directives (C-like). */
const CODE_EXTENSIONS_BRACE_OR_DIRECTIVE = new Set([
  '.c', '.cpp', '.h', '.hpp', '.cc', '.cxx',
  '.cs', '.cshtml', '.razor',
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.java', '.go', '.rs', '.kt', '.scala', '.swift',
]);

/** Default target chunk size (chars). */
const DEFAULT_TARGET_SIZE = 2400;
/** Margin: we may extend or shrink the chunk by this much to hit a boundary. */
const DEFAULT_MARGIN = 600;
/** Min chunk size; if we can't find a boundary in range, we still split here. */
const DEFAULT_MIN_CHUNK = 800;

export type CodeChunkOptions = {
  targetSize?: number;
  margin?: number;
  minChunkSize?: number;
  /** If true, always use code boundaries when possible. If false, fall back to chunkText for small content. */
  threshold?: number;
};

/**
 * Returns true if the file extension is one we apply code-boundary chunking to.
 */
export function isCodeFileForChunking(fileName: string): boolean {
  const i = fileName.lastIndexOf('.');
  const ext = i >= 0 ? fileName.substring(i).toLowerCase() : '';
  return CODE_EXTENSIONS_BRACE_OR_DIRECTIVE.has(ext);
}

/**
 * Finds positions in content where it's safe to split (after a newline):
 * - Brace depth returns to 0 (balanced {}).
 * - Line is #endif or #endregion (preprocessor/region end).
 * - Line is only "}" or "};" (block end).
 * Skips braces inside strings and comments.
 */
function findSafeSplitPositions(content: string): number[] {
  const positions: number[] = [0];
  const len = content.length;
  let i = 0;
  let depth = 0;
  let inDouble = false;
  let inSingle = false;
  let inLineComment = false;
  let inBlockComment = false;
  let blockStart = -1;
  let lineStart = 0;
  let lastNewlinePos = -1;

  while (i < len) {
    const c = content[i];

    if (inLineComment) {
      if (c === '\n') {
        inLineComment = false;
        lineStart = i + 1;
        lastNewlinePos = i;
      }
      i++;
      continue;
    }

    if (inBlockComment) {
      if (c === '*' && content[i + 1] === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (inDouble) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '"') {
        inDouble = false;
      }
      i++;
      continue;
    }

    if (inSingle) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === "'") {
        inSingle = false;
      }
      i++;
      continue;
    }

    if (c === '"') {
      inDouble = true;
      i++;
      continue;
    }
    if (c === "'") {
      inSingle = true;
      i++;
      continue;
    }
    if (c === '/' && content[i + 1] === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === '/' && content[i + 1] === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }

    if (c === '{') {
      depth++;
      i++;
      continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0) {
        // Split after end of line (so next chunk starts on a new line)
        let j = i + 1;
        while (j < len && content[j] !== '\n') j++;
        const afterNewline = j < len ? j + 1 : j;
        if (!positions.includes(afterNewline)) positions.push(afterNewline);
      }
      i++;
      continue;
    }

    if (c === '\n') {
      lineStart = i + 1;
      lastNewlinePos = i;
      i++;
      continue;
    }

    // #endif or #endregion at line start (after optional whitespace)
    if (c === '#' && (i === 0 || content[i - 1] === '\n')) {
      const rest = content.slice(i, i + 20);
      if (rest.startsWith('#endif') || rest.startsWith('#endregion')) {
        let j = i + 1;
        while (j < len && content[j] !== '\n') j++;
        const afterNewline = j < len ? j + 1 : j;
        if (!positions.includes(afterNewline)) positions.push(afterNewline);
      }
    }

    i++;
  }

  if (content.length > 0 && !positions.includes(content.length)) {
    positions.push(content.length);
  }
  return positions.sort((a, b) => a - b);
}

/**
 * Chunks code by splitting at safe boundaries (end of function/class/directive)
 * so that each chunk is roughly targetSize ± margin characters.
 * Falls back to chunkText if the file is not code-by-extension or no boundaries found.
 */
export function chunkCode(
  content: string,
  fileName: string,
  options?: CodeChunkOptions
): ChunkItem[] {
  const targetSize = options?.targetSize ?? DEFAULT_TARGET_SIZE;
  const margin = options?.margin ?? DEFAULT_MARGIN;
  const minChunkSize = options?.minChunkSize ?? DEFAULT_MIN_CHUNK;
  const threshold = options?.threshold ?? 500;

  if (!isCodeFileForChunking(fileName)) {
    return chunkText(content, { chunkSize: targetSize, threshold });
  }

  if (content.length <= threshold) {
    return [{ text: content, chunk_index: 0, total_chunks: 1 }];
  }

  const positions = findSafeSplitPositions(content);
  if (positions.length <= 1) {
    return chunkText(content, { chunkSize: targetSize, threshold });
  }

  const chunks: ChunkItem[] = [];
  let start = 0;
  let index = 0;

  while (start < content.length) {
    const idealEnd = start + targetSize;
    const low = start + Math.max(minChunkSize, targetSize - margin);
    const high = start + targetSize + margin;

    // Prefer a split in [low, high] closest to idealEnd; otherwise first split >= low; else end of content
    let bestPos = -1;
    let bestDist = Infinity;
    let fallbackPos = -1;
    for (let k = 0; k < positions.length; k++) {
      const p = positions[k];
      if (p <= start) continue;
      if (p >= content.length) {
        if (fallbackPos === -1) fallbackPos = content.length;
        break;
      }
      if (fallbackPos === -1 && p >= low) fallbackPos = p;
      if (p >= low && p <= high) {
        const dist = Math.abs(p - idealEnd);
        if (dist < bestDist) {
          bestDist = dist;
          bestPos = p;
        }
      }
    }

    if (bestPos === -1) bestPos = fallbackPos;
    if (bestPos === -1) bestPos = content.length;

    const text = content.slice(start, bestPos);
    if (text.length > 0) {
      chunks.push({ text, chunk_index: index, total_chunks: -1 });
      index++;
    }
    start = bestPos;
    if (start >= content.length) break;
  }

  const total = chunks.length;
  chunks.forEach((c) => (c.total_chunks = total));
  return chunks.length ? chunks : [{ text: content, chunk_index: 0, total_chunks: 1 }];
}
