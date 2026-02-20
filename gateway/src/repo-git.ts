/**
 * Repo Git - Operaciones seguras sobre el repositorio Git del workspace.
 * Usado por la herramienta MCP repo_git (alias: hacer push, commit, subir cambios, etc.).
 */

import path from 'path';
import fs from 'fs';
import { spawnSync, SpawnSyncReturns } from 'child_process';

const ALLOWED_ACTIONS = ['status', 'add', 'commit', 'push', 'pull'] as const;
export type GitAction = (typeof ALLOWED_ACTIONS)[number];

export interface RepoGitOptions {
  /** Acción: status | add | commit | push | pull */
  action: GitAction;
  /** Directorio del repo (por defecto process.cwd()) */
  directory?: string;
  /** Mensaje de commit (requerido si action === 'commit') */
  message?: string;
  /** Rutas para git add (solo si action === 'add'). Por defecto '.' */
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
 * Ejecuta una acción git permitida sobre el repositorio.
 * Devuelve { ok, output, error }.
 */
export function runRepoGit(options: RepoGitOptions): { ok: boolean; output: string; error?: string } {
  const dir = options.directory ? path.resolve(options.directory) : process.cwd();

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return { ok: false, output: '', error: `El directorio no existe o no es una carpeta: ${dir}` };
  }

  if (!isGitRepo(dir)) {
    return { ok: false, output: '', error: `No es un repositorio Git (no hay .git): ${dir}` };
  }

  const { action, message, paths } = options;

  if (!ALLOWED_ACTIONS.includes(action)) {
    return {
      ok: false,
      output: '',
      error: `Acción no permitida: "${action}". Permitidas: ${ALLOWED_ACTIONS.join(', ')}`,
    };
  }

  switch (action) {
    case 'status': {
      const r = runGit(['status', '--short', '-b'], dir);
      const out = (r.stdout ?? '').trim();
      const err = (r.stderr ?? '').trim();
      return {
        ok: r.status === 0,
        output: out || '(sin cambios)',
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
        output: out || `Añadido: ${pathsToAdd}`,
        error: r.status !== 0 ? err || `exit ${r.status}` : undefined,
      };
    }
    case 'commit': {
      const msg = (message ?? '').trim();
      if (!msg) {
        return { ok: false, output: '', error: 'Se requiere "message" para la acción commit.' };
      }
      const r = runGit(['commit', '-m', msg], dir);
      const out = (r.stdout ?? '').trim();
      const err = (r.stderr ?? '').trim();
      return {
        ok: r.status === 0,
        output: out || 'Commit creado.',
        error: r.status !== 0 ? err || `exit ${r.status}` : undefined,
      };
    }
    case 'push': {
      const r = runGit(['push'], dir);
      const out = (r.stdout ?? '').trim();
      const err = (r.stderr ?? '').trim();
      return {
        ok: r.status === 0,
        output: out || 'Push completado.',
        error: r.status !== 0 ? err || `exit ${r.status}` : undefined,
      };
    }
    case 'pull': {
      const r = runGit(['pull'], dir);
      const out = (r.stdout ?? '').trim();
      const err = (r.stderr ?? '').trim();
      return {
        ok: r.status === 0,
        output: out || 'Pull completado.',
        error: r.status !== 0 ? err || `exit ${r.status}` : undefined,
      };
    }
    default:
      return { ok: false, output: '', error: `Acción no implementada: ${action}` };
  }
}
