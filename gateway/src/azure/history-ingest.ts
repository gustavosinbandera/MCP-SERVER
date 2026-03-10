import { spawn } from 'child_process';
import {
  getChangeset,
  getChangesetChanges,
  getWorkItem,
  listChangesetsByItemPath,
  pickAuthor,
} from './client';

type IngestRow = {
  changeset_id: number;
  path_scope: string;
  author: string;
  created_at: string;
  comment: string;
  files: Array<{ file_path: string; change_type: string; module: string }>;
  work_item_ids: number[];
};

export type IngestSummary = {
  scanned_changesets: number;
  ingested_changesets: number;
  ingested_files: number;
  ingested_work_item_links: number;
  distinct_work_items: number;
};

export type IngestProgress = {
  stage: 'collecting' | 'enriching' | 'preparing_sql' | 'writing_remote' | 'done';
  paths_total?: number;
  paths_done?: number;
  changesets_seen?: number;
  changesets_total_estimate?: number;
  files_seen?: number;
  work_item_links_seen?: number;
  message?: string;
};

function parseWorkItemIdsFromComment(comment: string): number[] {
  const ids = new Set<number>();
  const re = /\b(?:bug|task|pbi)\s*#?\s*(\d{4,})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(comment)) !== null) {
    const id = Number(m[1]);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  return Array.from(ids).sort((a, b) => a - b);
}

function moduleFromPath(tfvcPath: string): string {
  const p = String(tfvcPath || '').replace(/\\/g, '/');
  const marker = '/BLUE-IVORY-';
  const up = p.toUpperCase();
  const idx = up.indexOf(marker);
  if (idx >= 0) {
    const rest = p.slice(idx + marker.length);
    const slash = rest.indexOf('/');
    if (slash >= 0) {
      const rem = rest.slice(slash + 1);
      return (rem.split('/')[0] || '').trim();
    }
  }
  const parts = p.split('/').filter(Boolean);
  return (parts.length > 1 ? parts[parts.length - 2] : '').trim();
}

function sqlLiteral(v: string | number | null): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlJson(v: unknown): string {
  return `${sqlLiteral(JSON.stringify(v))}::jsonb`;
}

function createSchemaSql(): string {
  return [
    'CREATE TABLE IF NOT EXISTS azure_changesets (',
    '  changeset_id BIGINT PRIMARY KEY,',
    '  path_scope TEXT NOT NULL,',
    '  author TEXT,',
    '  created_at TIMESTAMPTZ,',
    '  comment TEXT,',
    '  raw JSONB,',
    '  ingested_at TIMESTAMPTZ DEFAULT NOW()',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_azure_changesets_created_at ON azure_changesets(created_at DESC);',
    'CREATE INDEX IF NOT EXISTS idx_azure_changesets_scope ON azure_changesets(path_scope);',
    'CREATE TABLE IF NOT EXISTS azure_changeset_files (',
    '  changeset_id BIGINT NOT NULL,',
    '  file_path TEXT NOT NULL,',
    '  change_type TEXT,',
    '  module TEXT,',
    '  PRIMARY KEY(changeset_id, file_path)',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_azure_changeset_files_path ON azure_changeset_files(file_path);',
    'CREATE INDEX IF NOT EXISTS idx_azure_changeset_files_module ON azure_changeset_files(module);',
    'CREATE TABLE IF NOT EXISTS azure_work_items_cache (',
    '  work_item_id BIGINT PRIMARY KEY,',
    '  title TEXT,',
    '  state TEXT,',
    '  type TEXT,',
    '  changed_date TIMESTAMPTZ,',
    '  raw JSONB,',
    '  updated_at TIMESTAMPTZ DEFAULT NOW()',
    ');',
    'CREATE TABLE IF NOT EXISTS azure_changeset_work_items (',
    '  changeset_id BIGINT NOT NULL,',
    '  work_item_id BIGINT NOT NULL,',
    "  source TEXT DEFAULT 'comment',",
    '  PRIMARY KEY(changeset_id, work_item_id)',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_azure_csw_workitem ON azure_changeset_work_items(work_item_id);',
  ].join('\n');
}

async function runSshCommand(command: string, opts: { sshTarget: string; sshKeyPath: string }): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const args = ['-i', opts.sshKeyPath, opts.sshTarget, command];
    const cp = spawn('ssh', args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    cp.stdout.on('data', (d) => (stdout += String(d)));
    cp.stderr.on('data', (d) => (stderr += String(d)));
    cp.on('error', (e) => reject(e));
    cp.on('close', (code) => {
      if (code === 0) return resolve(stdout.trim());
      reject(new Error(stderr.trim() || `ssh exited with code ${code}`));
    });
  });
}

async function runRemotePsql(sql: string, opts: { sshTarget: string; sshKeyPath: string; remoteRepoPath: string; dbName: string }): Promise<string> {
  const b64 = Buffer.from(sql, 'utf8').toString('base64');
  const cmd =
    `cd ${opts.remoteRepoPath} && ` +
    `python3 - <<'PY'\n` +
    `import base64,subprocess\n` +
    `sql=base64.b64decode('${b64}').decode('utf-8')\n` +
    `p=subprocess.run(['docker','compose','exec','-T','postgres','psql','-U','postgres','-d','${opts.dbName}','-v','ON_ERROR_STOP=1'],input=sql.encode('utf-8'),stdout=subprocess.PIPE,stderr=subprocess.STDOUT)\n` +
    `print(p.stdout.decode('utf-8',errors='ignore'))\n` +
    `raise SystemExit(p.returncode)\n` +
    `PY`;
  return await runSshCommand(cmd, opts);
}

export async function collectChangesetsForPaths(options: {
  paths: string[];
  fromDate?: string;
  toDate?: string;
  author?: string;
  topPerPath?: number;
  projectName?: string;
  onProgress?: (p: IngestProgress) => void;
}): Promise<IngestRow[]> {
  const topPerPath = Math.min(Math.max(1, options.topPerPath ?? 1500), 20000);
  const out: IngestRow[] = [];
  const seen = new Set<number>();
  let totalFilesSeen = 0;
  let totalWiLinksSeen = 0;

  let pathDone = 0;
  for (const p of options.paths) {
    const scope = String(p || '').trim();
    if (!scope) continue;
    let skip = 0;
    const pageSize = 1000;
    const list: Awaited<ReturnType<typeof listChangesetsByItemPath>> = [];
    while (list.length < topPerPath) {
      const toFetch = Math.min(pageSize, topPerPath - list.length);
      const page = await listChangesetsByItemPath({
        itemPath: scope,
        author: options.author,
        fromDate: options.fromDate,
        toDate: options.toDate,
        top: toFetch,
        skip,
        projectName: options.projectName,
      });
      list.push(...page);
      options.onProgress?.({
        stage: 'collecting',
        paths_total: options.paths.length,
        paths_done: pathDone,
        changesets_seen: list.length,
        changesets_total_estimate: topPerPath,
        message: `Collecting path ${pathDone + 1}/${options.paths.length}: ${scope}`,
      });
      if (page.length < toFetch) break;
      skip += page.length;
    }

    let localProcessed = 0;
    for (const cs of list) {
      const id = Number(cs.changesetId || 0);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      const detail = await getChangeset(id);
      const changes = await getChangesetChanges(id);
      const files = (changes.value || []).map((it) => {
        const filePath = String(it.item?.path || it.item?.serverItem || '').trim();
        return {
          file_path: filePath,
          change_type: String(it.changeType || '').trim(),
          module: moduleFromPath(filePath),
        };
      });

      const comment = String(detail.comment || '').trim();
      const row: IngestRow = {
        changeset_id: id,
        path_scope: scope,
        author: pickAuthor(detail),
        created_at: String(detail.createdDate || detail.checkinDate || ''),
        comment,
        files,
        work_item_ids: parseWorkItemIdsFromComment(comment),
      };
      out.push(row);
      localProcessed += 1;
      totalFilesSeen += row.files.length;
      totalWiLinksSeen += row.work_item_ids.length;
      options.onProgress?.({
        stage: 'enriching',
        paths_total: options.paths.length,
        paths_done: pathDone,
        changesets_seen: localProcessed,
        changesets_total_estimate: list.length,
        files_seen: totalFilesSeen,
        work_item_links_seen: totalWiLinksSeen,
        message: `Enriching changesets for path ${pathDone + 1}/${options.paths.length}`,
      });
    }
    pathDone += 1;
  }

  out.sort((a, b) => b.changeset_id - a.changeset_id);
  return out;
}

export async function ingestRowsToRemotePostgres(
  rows: IngestRow[],
  options: {
    sshTarget: string;
    sshKeyPath: string;
    remoteRepoPath: string;
    dbName: string;
    includeWorkItems: boolean;
    onProgress?: (p: IngestProgress) => void;
  }
): Promise<IngestSummary> {
  const sql: string[] = [];
  sql.push('BEGIN;');
  sql.push(createSchemaSql());

  let ingestedFiles = 0;
  let ingestedLinks = 0;
  const distinctWi = new Set<number>();
  let csDone = 0;

  for (const r of rows) {
    const raw = {
      changeset_id: r.changeset_id,
      path_scope: r.path_scope,
      files_count: r.files.length,
      work_item_ids: r.work_item_ids,
    };
    sql.push(
      `INSERT INTO azure_changesets(changeset_id, path_scope, author, created_at, comment, raw, ingested_at) VALUES (` +
        `${sqlLiteral(r.changeset_id)}, ${sqlLiteral(r.path_scope)}, ${sqlLiteral(r.author)}, ${sqlLiteral(r.created_at)}, ${sqlLiteral(r.comment)}, ${sqlJson(raw)}, NOW()) ` +
        `ON CONFLICT (changeset_id) DO UPDATE SET path_scope=EXCLUDED.path_scope, author=EXCLUDED.author, created_at=EXCLUDED.created_at, comment=EXCLUDED.comment, raw=EXCLUDED.raw, ingested_at=NOW();`
    );
    for (const f of r.files) {
      ingestedFiles += 1;
      sql.push(
        `INSERT INTO azure_changeset_files(changeset_id, file_path, change_type, module) VALUES (` +
          `${sqlLiteral(r.changeset_id)}, ${sqlLiteral(f.file_path)}, ${sqlLiteral(f.change_type)}, ${sqlLiteral(f.module)}) ` +
          `ON CONFLICT (changeset_id, file_path) DO UPDATE SET change_type=EXCLUDED.change_type, module=EXCLUDED.module;`
      );
    }
    for (const wi of r.work_item_ids) {
      ingestedLinks += 1;
      distinctWi.add(wi);
      sql.push(
        `INSERT INTO azure_changeset_work_items(changeset_id, work_item_id, source) VALUES (` +
          `${sqlLiteral(r.changeset_id)}, ${sqlLiteral(wi)}, 'comment') ` +
          `ON CONFLICT (changeset_id, work_item_id) DO UPDATE SET source=EXCLUDED.source;`
      );
    }
    csDone += 1;
    options.onProgress?.({
      stage: 'preparing_sql',
      changesets_seen: csDone,
      changesets_total_estimate: rows.length,
      files_seen: ingestedFiles,
      work_item_links_seen: ingestedLinks,
      message: `Preparing SQL ${csDone}/${rows.length}`,
    });
  }

  if (options.includeWorkItems) {
    for (const wi of Array.from(distinctWi)) {
      try {
        const item = await getWorkItem(wi);
        const title = String(item.fields?.['System.Title'] ?? '');
        const state = String(item.fields?.['System.State'] ?? '');
        const type = String(item.fields?.['System.WorkItemType'] ?? '');
        const changed = String(item.fields?.['System.ChangedDate'] ?? '');
        sql.push(
          `INSERT INTO azure_work_items_cache(work_item_id, title, state, type, changed_date, raw, updated_at) VALUES (` +
            `${sqlLiteral(wi)}, ${sqlLiteral(title)}, ${sqlLiteral(state)}, ${sqlLiteral(type)}, ${sqlLiteral(changed)}, ${sqlJson(item)}, NOW()) ` +
            `ON CONFLICT (work_item_id) DO UPDATE SET title=EXCLUDED.title, state=EXCLUDED.state, type=EXCLUDED.type, changed_date=EXCLUDED.changed_date, raw=EXCLUDED.raw, updated_at=NOW();`
        );
      } catch {
        // best effort: keep ingest running even if one WI lookup fails
      }
    }
  }

  sql.push('COMMIT;');
  options.onProgress?.({
    stage: 'writing_remote',
    changesets_seen: rows.length,
    changesets_total_estimate: rows.length,
    files_seen: ingestedFiles,
    work_item_links_seen: ingestedLinks,
    message: 'Writing batch to remote Postgres...',
  });
  await runRemotePsql(sql.join('\n'), options);

  options.onProgress?.({
    stage: 'done',
    changesets_seen: rows.length,
    changesets_total_estimate: rows.length,
    files_seen: ingestedFiles,
    work_item_links_seen: ingestedLinks,
    message: 'Remote write completed.',
  });

  return {
    scanned_changesets: rows.length,
    ingested_changesets: rows.length,
    ingested_files: ingestedFiles,
    ingested_work_item_links: ingestedLinks,
    distinct_work_items: distinctWi.size,
  };
}
