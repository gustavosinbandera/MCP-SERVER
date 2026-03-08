/**
 * grep_symbols: extract C/C++ symbols (function, class, struct, namespace) via ripgrep.
 * Returns envelope with summary_text, data.counts, data.symbols.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { getProjectRoot } from '../config';
import { validateGrepCodePath } from './grep-code';

const GREP_SYMBOLS_TIMEOUT_MS = Math.max(2000, Math.min(60000, Number(process.env.GREP_SYMBOLS_TIMEOUT_MS) || 15_000));

export const SYMBOL_TYPES = ['function', 'class', 'struct', 'namespace'] as const;
export type SymbolType = (typeof SYMBOL_TYPES)[number];

/** Regex patterns for rg (PCRE not required; use basic regex). Names captured in group 1. */
const SYMBOL_PATTERNS: Record<SymbolType, string> = {
  namespace: String.raw`^\s*namespace\s+([A-Za-z_]\w*)`,
  class: String.raw`^\s*class\s+([A-Za-z_]\w*)`,
  struct: String.raw`^\s*struct\s+([A-Za-z_]\w*)`,
  function: String.raw`\b([A-Za-z_]\w*)\s*\([^)]*\)\s*(?:const)?\s*\{`, // heuristic: name ( ... ) { or ) const {
};

export interface GrepSymbolsInput {
  query?: string;
  path?: string;
  symbol_types?: SymbolType[];
  max_results?: number;
  include?: string;
}

export interface SymbolEntry {
  kind: SymbolType;
  name: string;
  file: string;
  line: number;
  signature: string;
}

export interface GrepSymbolsEnvelope {
  summary_text: string;
  data: {
    counts: Record<SymbolType, number>;
    symbols: SymbolEntry[];
  };
  meta: {
    tool_version: string;
    elapsed_ms: number;
    truncated: boolean;
    warnings: string[];
  };
}

export interface GrepSymbolsErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
  meta: { retryable: boolean; elapsed_ms: number };
}

function runRgPattern(
  basePath: string,
  pattern: string,
  include: string,
  timeoutMs: number
): Promise<{ file: string; line: number; text: string }[]> {
  return new Promise((resolve, reject) => {
    const args = ['-n', '--no-heading', '-e', pattern, basePath];
    if (include) args.splice(args.length - 1, 0, '-g', include);
    const proc = spawn('rg', args, {
      cwd: getProjectRoot(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      reject(new Error('TIMEOUT'));
    }, timeoutMs);
    proc.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && code !== 1) {
        reject(new Error(stderr || `rg exited ${code}`));
        return;
      }
      const results: { file: string; line: number; text: string }[] = [];
      for (const line of stdout.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(':');
        if (parts.length < 2) continue;
        const lineNum = parseInt(parts[parts.length - 2], 10);
        if (!Number.isFinite(lineNum)) continue;
        const file = parts.slice(0, -2).join(':').trim();
        const text = parts[parts.length - 1].trim();
        results.push({ file, line: lineNum, text });
      }
      resolve(results);
    });
  });
}

function extractName(kind: SymbolType, text: string): string {
  const pat = SYMBOL_PATTERNS[kind];
  const m = text.match(new RegExp(pat));
  if (m && m[1]) return m[1];
  if (kind === 'function') {
    const simple = text.match(/\b([A-Za-z_]\w*)\s*\(/);
    return simple ? simple[1] : text.slice(0, 40);
  }
  return text.slice(0, 40);
}

function buildSignature(kind: SymbolType, text: string, name: string): string {
  if (kind === 'namespace') return `namespace ${name}`;
  if (kind === 'class') return `class ${name}`;
  if (kind === 'struct') return `struct ${name}`;
  const oneLine = text.replace(/\s+/g, ' ').trim();
  const sig = oneLine.length > 80 ? oneLine.slice(0, 77) + '...' : oneLine;
  return sig || `void ${name}(...)`;
}

export async function runGrepSymbols(options: GrepSymbolsInput): Promise<GrepSymbolsEnvelope | GrepSymbolsErrorEnvelope> {
  const start = Date.now();
  const pathResult = validateGrepCodePath(options.path ?? 'blueivory');
  if (!pathResult.ok) {
    return {
      error: { code: pathResult.code, message: pathResult.message },
      meta: { retryable: false, elapsed_ms: Date.now() - start },
    };
  }
  const types = options.symbol_types?.length
    ? options.symbol_types.filter((t): t is SymbolType => SYMBOL_TYPES.includes(t as SymbolType))
    : [...SYMBOL_TYPES];
  if (types.length === 0) {
    return {
      error: { code: 'VALIDATION_ERROR', message: 'symbol_types must contain at least one of: function, class, struct, namespace' },
      meta: { retryable: false, elapsed_ms: Date.now() - start },
    };
  }
  const maxResults = Math.min(3000, Math.max(1, Number(options.max_results) ?? 300));
  const include = (options.include ?? '*.{h,hpp,hxx,c,cc,cxx,cpp,c++}').trim();
  const basePath = path.join(getProjectRoot(), pathResult.path);
  const query = (options.query ?? '').trim().toLowerCase();

  const allSymbols: SymbolEntry[] = [];
  const seen = new Set<string>();

  try {
    for (const kind of types) {
      const pattern = SYMBOL_PATTERNS[kind];
      const rows = await runRgPattern(basePath, pattern, include, GREP_SYMBOLS_TIMEOUT_MS);
      for (const { file, line, text } of rows) {
        const rel = path.relative(basePath, file).replace(/\\/g, '/');
        const name = extractName(kind, text);
        const key = `${rel}:${line}:${kind}:${name}`;
        if (seen.has(key)) continue;
        if (query && !name.toLowerCase().includes(query)) continue;
        seen.add(key);
        allSymbols.push({
          kind,
          name,
          file: rel,
          line,
          signature: buildSignature(kind, text, name),
        });
        if (allSymbols.length >= maxResults) break;
      }
      if (allSymbols.length >= maxResults) break;
    }
  } catch (err: unknown) {
    const elapsed = Date.now() - start;
    const isTimeout = err instanceof Error && err.message === 'TIMEOUT';
    const isEnoent = err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT';
    return {
      error: {
        code: isEnoent ? 'DEPENDENCY_MISSING' : isTimeout ? 'TIMEOUT' : 'EXEC_ERROR',
        message: isEnoent ? 'ripgrep (rg) is not installed' : isTimeout ? `grep_symbols timed out after ${GREP_SYMBOLS_TIMEOUT_MS}ms` : String(err instanceof Error ? err.message : err),
        details: err instanceof Error ? { err: err.message } : undefined,
      },
      meta: { retryable: !isEnoent, elapsed_ms: elapsed },
    };
  }

  const truncated = allSymbols.length >= maxResults;
  const symbols = allSymbols.slice(0, maxResults);
  const counts: Record<SymbolType, number> = { function: 0, class: 0, struct: 0, namespace: 0 };
  for (const s of symbols) counts[s.kind] += 1;
  const countStr = types.map((t) => `${t}:${counts[t]}`).join(', ');
  const warnings: string[] = [];
  if (truncated) warnings.push(`Results truncated to ${maxResults} symbols.`);

  return {
    summary_text: `Found ${symbols.length} symbols in ${new Set(symbols.map((s) => s.file)).size} files (${countStr})`,
    data: { counts, symbols },
    meta: {
      tool_version: 'v1',
      elapsed_ms: Date.now() - start,
      truncated,
      warnings,
    },
  };
}
