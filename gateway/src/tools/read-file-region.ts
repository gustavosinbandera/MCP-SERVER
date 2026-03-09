/**
 * read_file_region: read an exact file region from blueivory or classic.
 * Supports either explicit start/end lines or anchor line + context window.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getProjectRoot } from '../config';
import { validateGrepCodePath } from './grep-code';

export interface ReadFileRegionInput {
  file_path: string;
  start_line?: number;
  end_line?: number;
  line?: number;
  context_before?: number;
  context_after?: number;
}

export interface ReadFileRegionEnvelope {
  summary_text: string;
  data: {
    file_path: string;
    start_line: number;
    end_line: number;
    line_count: number;
    content: string;
  };
  meta: {
    tool_version: string;
    truncated: boolean;
    warnings: string[];
  };
}

export interface ReadFileRegionErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
  meta: { retryable: boolean };
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

export function runReadFileRegion(options: ReadFileRegionInput): ReadFileRegionEnvelope | ReadFileRegionErrorEnvelope {
  const rawPath = String(options.file_path || '').trim();
  if (!rawPath) {
    return {
      error: { code: 'VALIDATION_ERROR', message: 'file_path is required' },
      meta: { retryable: false },
    };
  }

  const pathResult = validateGrepCodePath(rawPath);
  if (!pathResult.ok) {
    return {
      error: { code: pathResult.code, message: pathResult.message },
      meta: { retryable: false },
    };
  }

  const absPath = path.join(getProjectRoot(), pathResult.path);
  if (!fs.existsSync(absPath)) {
    return {
      error: { code: 'NOT_FOUND', message: `file not found: ${pathResult.path}` },
      meta: { retryable: false },
    };
  }
  if (!fs.statSync(absPath).isFile()) {
    return {
      error: { code: 'VALIDATION_ERROR', message: `path is not a file: ${pathResult.path}` },
      meta: { retryable: false },
    };
  }

  let content = '';
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    return {
      error: {
        code: 'READ_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
      meta: { retryable: true },
    };
  }

  const lines = content.split(/\r?\n/);
  const totalLines = lines.length;
  const warnings: string[] = [];

  let startLine = 1;
  let endLine = totalLines;

  if (options.start_line != null || options.end_line != null) {
    startLine = clampInt(options.start_line, 1, totalLines, 1);
    endLine = clampInt(options.end_line, 1, totalLines, totalLines);
  } else if (options.line != null) {
    const anchor = clampInt(options.line, 1, totalLines, 1);
    const before = clampInt(options.context_before, 0, 200, 20);
    const after = clampInt(options.context_after, 0, 200, 20);
    startLine = Math.max(1, anchor - before);
    endLine = Math.min(totalLines, anchor + after);
  } else {
    endLine = Math.min(totalLines, 80);
    warnings.push('No explicit line range given; defaulted to first 80 lines.');
  }

  if (startLine > endLine) {
    const tmp = startLine;
    startLine = endLine;
    endLine = tmp;
    warnings.push('Swapped start_line and end_line because start_line was greater than end_line.');
  }

  const maxLines = 300;
  let truncated = false;
  if (endLine - startLine + 1 > maxLines) {
    endLine = startLine + maxLines - 1;
    truncated = true;
    warnings.push(`Region truncated to ${maxLines} lines.`);
  }

  const slice = lines.slice(startLine - 1, endLine);
  const regionText = slice.map((line, idx) => `${startLine + idx}: ${line}`).join('\n');

  return {
    summary_text: `Read ${pathResult.path}:${startLine}-${endLine} (${slice.length} lines)` + (truncated ? ' [truncated]' : ''),
    data: {
      file_path: pathResult.path,
      start_line: startLine,
      end_line: endLine,
      line_count: slice.length,
      content: regionText,
    },
    meta: {
      tool_version: 'v1',
      truncated,
      warnings,
    },
  };
}
