/**
 * Semgrep integration for MCP: run semgrep scan on a directory via CLI.
 * Requires semgrep to be installed (pip install semgrep or similar).
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { getProjectRoot } from './config';

const execFileAsync = promisify(execFile);
export const SEMGREP_V2_DELIMITER = '\n\n<!--SEMGREP_V2-->\n';

type SemgrepStatus = 'completed' | 'findings' | 'no_findings' | 'timeout' | 'invalid_input' | 'execution_error';

const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 600_000;

function resolvePath(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (path.isAbsolute(trimmed)) return trimmed;
  return path.join(getProjectRoot(), trimmed);
}

export interface SemgrepScanResult {
  ok: boolean;
  target: string;
  config: string;
  format: 'json' | 'text';
  status: SemgrepStatus;
  elapsedMs: number;
  timedOut: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  warnings?: string[];
  includePatterns?: string[];
  excludePatterns?: string[];
  /** Parsed findings count when output is JSON (optional). */
  findingsCount?: number;
  parsedJson?: unknown;
}

function clampTimeout(timeoutMs?: number): number {
  if (timeoutMs == null || !Number.isFinite(timeoutMs)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(timeoutMs)));
}

function parsePatterns(input?: string): string[] {
  if (!input) return [];
  return input
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

function normalizeConfig(input?: string): { requested: string; effective: string; warnings: string[] } {
  const requested = input?.trim() || 'auto';
  const warnings: string[] = [];
  let effective = requested;
  if (requested === 'p/cpp') {
    effective = 'p/c';
    warnings.push('Semgrep registry config "p/cpp" is not valid in Semgrep 1.154.0; using "p/c" instead.');
  }
  return { requested, effective, warnings };
}

/**
 * Run semgrep scan on a path. Uses CLI: semgrep scan --config <config> --json (or --text).
 * config: "auto" (default), "p/javascript", "p/typescript", or path to rule file.
 */
export async function runSemgrepScan(options: {
  path: string;
  config?: string;
  format?: 'json' | 'text';
  timeoutMs?: number;
  include?: string;
  exclude?: string;
  extraArgs?: string[];
}): Promise<SemgrepScanResult> {
  const startedAt = Date.now();
  const targetDir = resolvePath(options.path);
  const relativeDisplay = path.relative(getProjectRoot(), targetDir);
  const { effective: config, warnings } = normalizeConfig(options.config);
  const format = options.format || 'text';
  const timeoutMs = clampTimeout(options.timeoutMs);
  const includePatterns = parsePatterns(options.include);
  const excludePatterns = parsePatterns(options.exclude);

  if (!fs.existsSync(targetDir)) {
    return {
      ok: false,
      target: relativeDisplay,
      config,
      format,
      status: 'invalid_input',
      elapsedMs: Date.now() - startedAt,
      timedOut: false,
      error: `Path not found: ${targetDir}`,
      warnings,
    };
  }

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    return {
      ok: false,
      target: relativeDisplay,
      config,
      format,
      status: 'invalid_input',
      elapsedMs: Date.now() - startedAt,
      timedOut: false,
      error: `Not a directory: ${targetDir}`,
      warnings,
    };
  }

  const args: string[] = ['scan', '--config', config, '--quiet'];
  if (format === 'json') {
    args.push('--json');
  }
  for (const pattern of includePatterns) args.push('--include', pattern);
  for (const pattern of excludePatterns) args.push('--exclude', pattern);
  if (options.extraArgs?.length) {
    args.push(...options.extraArgs);
  }
  args.push(targetDir);

  try {
    const { stdout, stderr } = await execFileAsync('semgrep', args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      timeout: timeoutMs,
    });

    const elapsedMs = Date.now() - startedAt;

    let findingsCount: number | undefined;
    let parsedJson: unknown;
    if (format === 'json' && stdout) {
      try {
        const data = JSON.parse(stdout) as { results?: unknown[] };
        parsedJson = data;
        const results = data.results ?? [];
        findingsCount = Array.isArray(results) ? results.length : 0;
      } catch {
        // ignore parse errors
      }
    }

    const status: SemgrepStatus = findingsCount === 0 || (!stdout.trim() && !stderr.trim()) ? 'no_findings' : 'completed';

    return {
      ok: true,
      target: relativeDisplay,
      config,
      format,
      status,
      elapsedMs,
      timedOut: false,
      exitCode: 0,
      stdout: stdout || undefined,
      stderr: stderr || undefined,
      warnings: warnings.length ? warnings : undefined,
      includePatterns: includePatterns.length ? includePatterns : undefined,
      excludePatterns: excludePatterns.length ? excludePatterns : undefined,
      findingsCount,
      parsedJson,
    };
  } catch (err: unknown) {
    const execErr = err as { code?: number; killed?: boolean; signal?: string; stdout?: string; stderr?: string };
    const stdout = execErr.stdout ?? '';
    const stderr = execErr.stderr ?? '';
    const elapsedMs = Date.now() - startedAt;
    const timedOut = Boolean(execErr.killed) || (err instanceof Error && /timed out/i.test(err.message));
    let findingsCount: number | undefined;
    let parsedJson: unknown;
    if (format === 'json' && stdout) {
      try {
        const data = JSON.parse(stdout);
        parsedJson = data;
        const results = (data as { results?: unknown[] }).results ?? [];
        findingsCount = Array.isArray(results) ? results.length : 0;
      } catch {
        // ignore parse errors
      }
    }
    const msg = timedOut
      ? `Semgrep timed out after ${timeoutMs} ms.`
      : execErr.code === 1
        ? 'Semgrep finished with findings (exit code 1).'
        : execErr instanceof Error
          ? execErr.message
          : String(err);
    const status: SemgrepStatus = timedOut
      ? 'timeout'
      : execErr.code === 1
        ? 'findings'
        : 'execution_error';
    return {
      ok: execErr.code === 1,
      target: relativeDisplay,
      config,
      format,
      status,
      elapsedMs,
      timedOut,
      exitCode: execErr.code,
      stdout: stdout || undefined,
      stderr: stderr || undefined,
      warnings: warnings.length ? warnings : undefined,
      includePatterns: includePatterns.length ? includePatterns : undefined,
      excludePatterns: excludePatterns.length ? excludePatterns : undefined,
      error: msg,
      findingsCount,
      parsedJson,
    };
  }
}
