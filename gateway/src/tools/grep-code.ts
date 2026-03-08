/**
 * grep_code: search with ripgrep (rg) in blueivory or classic.
 * Returns envelope with summary_text, data.matches, meta.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getProjectRoot } from '../config';

const GREP_TIMEOUT_MS = Math.max(1000, Math.min(60000, Number(process.env.GREP_CODE_TIMEOUT_MS) || 10_000));

const ALLOWED_PATH_PREFIXES = ['blueivory', 'classic'];

function normalizePathInput(p: string): string {
  return p.replace(/\\/g, '/').trim().replace(/\/+/g, '/');
}

export function validateGrepCodePath(inputPath: string): { ok: true; path: string } | { ok: false; code: string; message: string } {
  const raw = (inputPath ?? '').trim();
  const normalized = normalizePathInput(raw);

  if (raw === '') return { ok: true, path: 'blueivory' };

  if (path.isAbsolute(normalized) || normalized.startsWith('/') || /^[A-Za-z]:[\\/]/.test(normalized) || normalized.startsWith('~')) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'path must not be absolute (no /, C:\\, ~)' };
  }
  if (normalized.includes('..')) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'path must not contain traversal (..)' };
  }
  const firstSegment = normalized.split('/')[0];
  if (!ALLOWED_PATH_PREFIXES.includes(firstSegment)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: `path must start with blueivory or classic, got: ${firstSegment || '(empty)'}` };
  }
  return { ok: true, path: normalized || 'blueivory' };
}

export interface GrepCodeInput {
  pattern: string;
  path?: string;
  include?: string;
  ignore_case?: boolean;
  max_matches?: number;
  context_lines?: number;
}

export interface GrepMatch {
  file: string;
  line: number;
  column: number;
  text: string;
  context_before: string[];
  context_after: string[];
}

export interface GrepCodeEnvelope {
  summary_text: string;
  data: {
    total_matches: number;
    total_files: number;
    matches: GrepMatch[];
  };
  meta: {
    tool_version: string;
    elapsed_ms: number;
    truncated: boolean;
    warnings: string[];
  };
}

export interface GrepCodeErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
  meta: { retryable: boolean; elapsed_ms: number };
}

function parseRgJsonLines(stdout: string, basePath: string, contextLines: number): GrepMatch[] {
  const matches: GrepMatch[] = [];
  const seen = new Set<string>();
  const lines = stdout.split('\n');
  let currentPath: string = '';
  let contextBefore: string[] = [];
  const contextBuf: string[] = [];
  const flushContext = (): void => {
    if (contextLines > 0 && contextBuf.length > contextLines) {
      contextBefore = contextBuf.slice(-contextLines);
    }
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line) as { type?: string; data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string }; submatches?: Array<{ start: number; end: number; match: { text: string } }> } };
      if (obj.type === 'begin' && obj.data?.path?.text != null) {
        currentPath = obj.data.path.text;
        contextBuf.length = 0;
        contextBefore = [];
      }
      if (obj.type === 'match' && obj.data) {
        const file = obj.data.path?.text ?? currentPath;
        const rel = path.relative(basePath, file).replace(/\\/g, '/');
        const lineNum = obj.data.line_number ?? 0;
        const text = obj.data.lines?.text ?? '';
        const sub = obj.data.submatches?.[0];
        const column = sub != null ? (sub.start ?? 0) + 1 : 1;
        const key = `${rel}:${lineNum}:${column}`;
        if (seen.has(key)) continue;
        seen.add(key);
        flushContext();
        matches.push({
          file: rel,
          line: lineNum,
          column,
          text: text.trimEnd(),
          context_before: contextBefore.slice(),
          context_after: [],
        });
        contextBuf.push(text);
        if (contextLines > 0 && contextBuf.length > contextLines + 1) contextBuf.shift();
      }
      if (obj.type === 'context' && obj.data?.lines?.text != null) {
        contextBuf.push(obj.data.lines.text);
        if (contextBuf.length > contextLines + 1) contextBuf.shift();
      }
    } catch {
      // ignore malformed lines
    }
  }
  return matches;
}

function fillContextFromFile(basePath: string, match: GrepMatch, contextLines: number): void {
  if (contextLines <= 0) return;
  const absPath = path.join(basePath, match.file);
  try {
    const content = fs.readFileSync(absPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const oneBased = match.line;
    const idx = oneBased - 1;
    match.context_before = lines.slice(Math.max(0, idx - contextLines), idx);
    match.context_after = lines.slice(idx + 1, idx + 1 + contextLines);
  } catch {
    // leave context empty on read error
  }
}

export function runGrepCode(options: GrepCodeInput): Promise<GrepCodeEnvelope | GrepCodeErrorEnvelope> {
  const start = Date.now();
  const pattern = (options.pattern ?? '').trim();
  if (!pattern) {
    return Promise.resolve({
      error: { code: 'VALIDATION_ERROR', message: 'pattern is required and must not be empty' },
      meta: { retryable: false, elapsed_ms: Date.now() - start },
    });
  }

  const pathResult = validateGrepCodePath(options.path ?? 'blueivory');
  if (!pathResult.ok) {
    return Promise.resolve({
      error: { code: pathResult.code, message: pathResult.message },
      meta: { retryable: false, elapsed_ms: Date.now() - start },
    });
  }

  const maxMatches = Math.min(2000, Math.max(1, Number(options.max_matches) ?? 200));
  const contextLines = Math.min(3, Math.max(0, Number(options.context_lines) ?? 0));
  const basePath = path.join(getProjectRoot(), pathResult.path);
  const args: string[] = ['--json', '-n', '--no-heading', pattern, basePath];
  if (options.ignore_case === true) args.splice(args.length - 2, 0, '-i');
  if (options.include?.trim()) args.splice(args.length - 2, 0, '-g', options.include.trim());
  if (contextLines > 0) {
    args.splice(args.length - 2, 0, '-A', String(contextLines), '-B', String(contextLines));
  }

  return new Promise((resolve) => {
    let settled = false;
    const resolveOnce = (value: GrepCodeEnvelope | GrepCodeErrorEnvelope): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const proc = spawn('rg', args, {
      cwd: getProjectRoot(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      kill(proc, 'TIMEOUT');
      resolveOnce({
        error: { code: 'TIMEOUT', message: `grep_code timed out after ${GREP_TIMEOUT_MS}ms` },
        meta: { retryable: true, elapsed_ms: GREP_TIMEOUT_MS },
      });
    }, GREP_TIMEOUT_MS);

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      const code = err.code === 'ENOENT' ? 'DEPENDENCY_MISSING' : 'EXEC_ERROR';
      resolveOnce({
        error: { code, message: err.code === 'ENOENT' ? 'ripgrep (rg) is not installed' : String(err.message), details: { err: err.message } },
        meta: { retryable: code === 'DEPENDENCY_MISSING' ? false : true, elapsed_ms: Date.now() - start },
      });
    });

    proc.on('close', (code, signal) => {
      const elapsed = Date.now() - start;
      if (code === 2 || (code !== 0 && code !== 1)) {
        resolveOnce({
          error: { code: 'EXEC_ERROR', message: stderr || `rg exited ${code}${signal ? ` signal ${signal}` : ''}`, details: { code, signal, stderr: stderr.slice(0, 500) } },
          meta: { retryable: false, elapsed_ms: elapsed },
        });
        return;
      }
      const matches = parseRgJsonLines(stdout, basePath, contextLines);
      const truncated = matches.length > maxMatches;
      const finalMatches = matches.slice(0, maxMatches);
      if (contextLines > 0) {
        for (const m of finalMatches) fillContextFromFile(basePath, m, contextLines);
      }
      const fileSet = new Set(finalMatches.map((m) => m.file));
      const warnings: string[] = [];
      if (truncated) warnings.push(`Results truncated to ${maxMatches} matches.`);
      resolveOnce({
        summary_text: `${finalMatches.length} matches in ${fileSet.size} files under ${pathResult.path}`,
        data: {
          total_matches: finalMatches.length,
          total_files: fileSet.size,
          matches: finalMatches,
        },
        meta: {
          tool_version: 'v1',
          elapsed_ms: elapsed,
          truncated,
          warnings,
        },
      });
    });
  });
}

function kill(proc: ReturnType<typeof spawn>, _reason: string): void {
  try {
    proc.kill('SIGKILL');
  } catch {
    // ignore
  }
}
