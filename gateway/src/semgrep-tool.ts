/**
 * Semgrep integration for MCP: run semgrep scan on a directory via CLI.
 * Requires semgrep to be installed (pip install semgrep or similar).
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getProjectRoot } from './config';

function execFileWithOutput(
  bin: string,
  args: string[],
  opts: { encoding: 'utf8'; maxBuffer: number; timeout: number }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, opts, (err, stdout, stderr) => {
      const out = stdout ?? '';
      const errOut = stderr ?? '';
      if (err) {
        (err as NodeJS.ErrnoException & { stdout?: string; stderr?: string }).stdout = out;
        (err as NodeJS.ErrnoException & { stdout?: string; stderr?: string }).stderr = errOut;
        reject(err);
      } else {
        resolve({ stdout: out, stderr: errOut });
      }
    });
  });
}

function resolvePath(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (path.isAbsolute(trimmed)) return trimmed;
  return path.join(getProjectRoot(), trimmed);
}

export interface SemgrepScanResult {
  ok: boolean;
  target: string;
  stdout?: string;
  stderr?: string;
  error?: string;
  /** Parsed findings count when output is JSON (optional). */
  findingsCount?: number;
}

/**
 * Run semgrep scan on a path. Uses CLI: semgrep scan --config <config> --json (or --text).
 * config: "auto" (default), "p/javascript", "p/typescript", or path to rule file.
 */
export async function runSemgrepScan(options: {
  path: string;
  config?: string;
  format?: 'json' | 'text';
  extraArgs?: string[];
}): Promise<SemgrepScanResult> {
  const targetDir = resolvePath(options.path);
  const relativeDisplay = path.relative(getProjectRoot(), targetDir);

  if (!fs.existsSync(targetDir)) {
    return { ok: false, target: relativeDisplay, error: `Path not found: ${targetDir}` };
  }

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    return { ok: false, target: relativeDisplay, error: `Not a directory: ${targetDir}` };
  }

  const config = options.config?.trim() || 'auto';
  const format = options.format || 'text';
  const args: string[] = ['scan', '--config', config, '--quiet'];
  if (format === 'json') {
    args.push('--json');
  }
  if (options.extraArgs?.length) {
    args.push(...options.extraArgs);
  }
  args.push(targetDir);

  const semgrepBin = process.env.SEMGREP_BIN || 'semgrep';
  const execOpts = {
    encoding: 'utf8' as const,
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  };

  try {
    const { stdout, stderr } = await execFileWithOutput(semgrepBin, args, execOpts);

    let findingsCount: number | undefined;
    if (format === 'json' && stdout) {
      try {
        const data = JSON.parse(stdout);
        const results = data.results ?? [];
        findingsCount = Array.isArray(results) ? results.length : 0;
      } catch {
        // ignore parse errors
      }
    }

    return {
      ok: true,
      target: relativeDisplay,
      stdout: stdout || undefined,
      stderr: stderr || undefined,
      findingsCount,
    };
  } catch (err: unknown) {
    const execErr = err as { code?: number; killed?: boolean; signal?: string; stdout?: string; stderr?: string; message?: string };
    const out = execErr.stdout ?? '';
    const errOut = execErr.stderr ?? '';
    let msg =
      execErr.code === 1 && (out || errOut)
        ? 'Semgrep finished with findings (exit code 1).'
        : execErr instanceof Error
          ? execErr.message
          : String(err);
    if (errOut && msg.indexOf(errOut) === -1) msg += '\nstderr: ' + errOut;
    return {
      ok: execErr.code === 1,
      target: relativeDisplay,
      stdout: out || undefined,
      stderr: errOut || undefined,
      error: msg,
    };
  }
}
