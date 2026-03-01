/**
 * Repo Git - Safe operations on the workspace Git repository.
 * Used by the MCP tool repo_git (aliases: push, commit, upload changes, etc.).
 */

import path from 'path';
import fs from 'fs';
import { spawnSync, SpawnSyncReturns } from 'child_process';

const ALLOWED_ACTIONS = ['status', 'add', 'commit', 'push', 'pull'] as const;
export type GitAction = (typeof ALLOWED_ACTIONS)[number];

export interface RepoGitOptions {
  /** Action: status | add | commit | push | pull */
  action: GitAction;
  /** Repo directory (defaults to process.cwd()) */
  directory?: string;
  /** Commit message (required if action === 'commit') */
  message?: string;
  /** Paths for git add (only if action === 'add'). Defaults to '.' */
  paths?: string;
}

function isGitRepo(dir: string): boolean {
  const gitDir = path.join(dir, '.git');
  try {
    return fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory();
  } catch {
    return false;
  }
}

function runGit(args: string[], cwd: string): SpawnSyncReturns<string> {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    timeout: 60000,
  });
}

/**
 * Run an allowed git action on the repository.
 * Returns { ok, output, error }.
 */
export function runRepoGit(options: RepoGitOptions): { ok: boolean; output: string; error?: string } {
  const dir = options.directory ? path.resolve(options.directory) : process.cwd();

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return { ok: false, output: '', error: `Directory does not exist or is not a folder: ${dir}` };
  }

  if (!isGitRepo(dir)) {
    return { ok: false, output: '', error: `Not a Git repository (.git not found): ${dir}` };
  }

  const { action, message, paths } = options;

  if (!ALLOWED_ACTIONS.includes(action)) {
    return {
      ok: false,
      output: '',
      error: `Action not allowed: "${action}". Allowed: ${ALLOWED_ACTIONS.join(', ')}`,
    };
  }

  switch (action) {
    case 'status': {
      const r = runGit(['status', '--short', '-b'], dir);
      const out = (r.stdout ?? '').trim();
      const err = (r.stderr ?? '').trim();
      return {
        ok: r.status === 0,
        output: out || '(no changes)',
        error: r.status !== 0 ? err || `exit ${r.status}` : undefined,
      };
    }
    case 'add': {
      const pathsToAdd = (paths ?? '.').trim() || '.';
      const r = runGit(['add', '--', ...pathsToAdd.split(/\s+/).filter(Boolean)], dir);
      const out = (r.stdout ?? '').trim();
      const err = (r.stderr ?? '').trim();
      return {
        ok: r.status === 0,
        output: out || `Added: ${pathsToAdd}`,
        error: r.status !== 0 ? err || `exit ${r.status}` : undefined,
      };
    }
    case 'commit': {
      const msg = (message ?? '').trim();
      if (!msg) {
        return { ok: false, output: '', error: '"message" is required for the commit action.' };
      }
      const r = runGit(['commit', '-m', msg], dir);
      const out = (r.stdout ?? '').trim();
      const err = (r.stderr ?? '').trim();
      return {
        ok: r.status === 0,
        output: out || 'Commit created.',
        error: r.status !== 0 ? err || `exit ${r.status}` : undefined,
      };
    }
    case 'push': {
      const r = runGit(['push'], dir);
      const out = (r.stdout ?? '').trim();
      const err = (r.stderr ?? '').trim();
      return {
        ok: r.status === 0,
        output: out || 'Push completed.',
        error: r.status !== 0 ? err || `exit ${r.status}` : undefined,
      };
    }
    case 'pull': {
      const r = runGit(['pull'], dir);
      const out = (r.stdout ?? '').trim();
      const err = (r.stderr ?? '').trim();
      return {
        ok: r.status === 0,
        output: out || 'Pull completed.',
        error: r.status !== 0 ? err || `exit ${r.status}` : undefined,
      };
    }
    default:
      return { ok: false, output: '', error: `Action not implemented: ${action}` };
  }
}
