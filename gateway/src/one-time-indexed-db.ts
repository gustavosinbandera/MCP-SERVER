/**
 * Persistencia en SQLite de los proyectos ya indexados una vez (SHARED_DIRS_ONCE).
 * Evita reindexar classic/blueivory u otros proyectos one-time en ciclos posteriores.
 */
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { getOneTimeIndexedDbPath } from './config';
import { info } from './logger';

const TABLE = 'one_time_indexed';

let _db: Database.Database | null = null;

function ensureDirFor(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = getOneTimeIndexedDbPath();
  ensureDirFor(dbPath);
  _db = new Database(dbPath);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      project TEXT NOT NULL PRIMARY KEY
    );
  `);
  return _db;
}

/** Ruta del archivo legacy (one project per line) por si existe y hay que migrar. */
function getLegacyFilePath(): string {
  return path.resolve(path.dirname(getOneTimeIndexedDbPath()), 'one_time_indexed_projects.txt');
}

/**
 * Si existe el archivo legacy, lee los proyectos y los inserta en SQLite; luego renombra el archivo.
 */
function migrateFromFileIfExists(): void {
  const filePath = getLegacyFilePath();
  if (!fs.existsSync(filePath)) return;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const projects = new Set<string>();
    for (const line of content.split(/\r?\n/)) {
      const p = line.trim().toLowerCase();
      if (p && !p.startsWith('#')) projects.add(p);
    }
    if (projects.size === 0) {
      fs.renameSync(filePath, filePath + '.migrated');
      return;
    }
    const db = getDb();
    const insert = db.prepare(`INSERT OR IGNORE INTO ${TABLE} (project) VALUES (?)`);
    const insertMany = db.transaction((list: string[]) => {
      for (const p of list) insert.run(p);
    });
    insertMany([...projects]);
    info('one_time_indexed: migrated from file to SQLite', { count: projects.size, projects: [...projects] });
    fs.renameSync(filePath, filePath + '.migrated');
  } catch (e) {
    info('one_time_indexed: migrate from file failed', { err: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Devuelve el conjunto de proyectos ya indexados una vez (clave que evita reindexar).
 */
export function loadOneTimeIndexedProjects(): Set<string> {
  migrateFromFileIfExists();
  const db = getDb();
  const rows = db.prepare(`SELECT project FROM ${TABLE}`).all() as { project: string }[];
  const set = new Set<string>();
  for (const r of rows) if (r.project) set.add(r.project.trim().toLowerCase());
  return set;
}

/**
 * Marca un proyecto como indexado una vez; no se volverá a indexar (persistido en SQLite).
 */
export function addOneTimeIndexedProject(project: string): void {
  const key = project.trim().toLowerCase();
  if (!key) return;
  const db = getDb();
  db.prepare(`INSERT OR IGNORE INTO ${TABLE} (project) VALUES (?)`).run(key);
}
