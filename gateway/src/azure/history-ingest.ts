import { spawn } from 'child_process';
import {
  getChangeset,
  getChangesetChanges,
  getWorkItem,
  listChangesetsByItemPath,
  pickAuthor,
} from './client';
import { workItemToCompact } from './response-envelope';

type IngestRow = {
  changeset_id: number;
  path_scope: string;
  author: string;
  created_at: string;
  comment: string;
  files: Array<{ file_path: string; change_type: string; module: string }>;
  work_item_links: Array<{ work_item_id: number; source: 'comment' | 'relation' }>;
};

export type IngestSummary = {
  scanned_changesets: number;
  ingested_changesets: number;
  ingested_files: number;
  ingested_work_item_links: number;
  distinct_work_items: number;
  file_history_signals_upserted?: number;
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

function parseWorkItemIdsFromChangesetDetail(detail: Record<string, unknown>): number[] {
  const ids = new Set<number>();

  const fromWorkItemsArray = (detail as { workItems?: Array<{ id?: unknown }> }).workItems;
  if (Array.isArray(fromWorkItemsArray)) {
    for (const wi of fromWorkItemsArray) {
      const id = Number((wi as { id?: unknown }).id);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }
  }

  const fromRelated = (detail as { artifactUriQueryResult?: { workItemIds?: unknown[] } }).artifactUriQueryResult;
  const workItemIds = fromRelated?.workItemIds;
  if (Array.isArray(workItemIds)) {
    for (const raw of workItemIds) {
      const id = Number(raw);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }
  }

  // Fallback: scan serialized payload for URLs/patterns containing work item ids.
  const payload = JSON.stringify(detail);
  const re = /(?:workitems\/|workitem\/|workItemId\W+)(\d{4,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(payload)) !== null) {
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
    '  area_path TEXT,',
    '  iteration_path TEXT,',
    '  assigned_to TEXT,',
    '  tags TEXT,',
    '  severity TEXT,',
    '  priority TEXT,',
    '  description_text TEXT,',
    '  expected_behavior_text TEXT,',
    '  actual_behavior_text TEXT,',
    '  repro_steps_text TEXT,',
    '  raw JSONB,',
    '  updated_at TIMESTAMPTZ DEFAULT NOW()',
    ');',
    'ALTER TABLE azure_work_items_cache ADD COLUMN IF NOT EXISTS area_path TEXT;',
    'ALTER TABLE azure_work_items_cache ADD COLUMN IF NOT EXISTS iteration_path TEXT;',
    'ALTER TABLE azure_work_items_cache ADD COLUMN IF NOT EXISTS assigned_to TEXT;',
    'ALTER TABLE azure_work_items_cache ADD COLUMN IF NOT EXISTS tags TEXT;',
    'ALTER TABLE azure_work_items_cache ADD COLUMN IF NOT EXISTS severity TEXT;',
    'ALTER TABLE azure_work_items_cache ADD COLUMN IF NOT EXISTS priority TEXT;',
    'ALTER TABLE azure_work_items_cache ADD COLUMN IF NOT EXISTS description_text TEXT;',
    'ALTER TABLE azure_work_items_cache ADD COLUMN IF NOT EXISTS expected_behavior_text TEXT;',
    'ALTER TABLE azure_work_items_cache ADD COLUMN IF NOT EXISTS actual_behavior_text TEXT;',
    'ALTER TABLE azure_work_items_cache ADD COLUMN IF NOT EXISTS repro_steps_text TEXT;',
    'CREATE INDEX IF NOT EXISTS idx_azure_wi_state_type_changed ON azure_work_items_cache(state, type, changed_date DESC);',
    'CREATE INDEX IF NOT EXISTS idx_azure_wi_title ON azure_work_items_cache(title);',
    'CREATE TABLE IF NOT EXISTS azure_changeset_work_items (',
    '  changeset_id BIGINT NOT NULL,',
    '  work_item_id BIGINT NOT NULL,',
    "  source TEXT DEFAULT 'comment',",
    '  PRIMARY KEY(changeset_id, work_item_id)',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_azure_csw_workitem ON azure_changeset_work_items(work_item_id);',
    'CREATE TABLE IF NOT EXISTS azure_ingest_runs (',
    '  run_id TEXT PRIMARY KEY,',
    '  mode TEXT NOT NULL,',
    '  path_scope TEXT,',
    '  window_from DATE,',
    '  window_to DATE,',
    '  status TEXT NOT NULL,',
    '  started_at TIMESTAMPTZ DEFAULT NOW(),',
    '  finished_at TIMESTAMPTZ,',
    '  scanned_changesets INT DEFAULT 0,',
    '  ingested_changesets INT DEFAULT 0,',
    '  ingested_files INT DEFAULT 0,',
    '  ingested_work_item_links INT DEFAULT 0,',
    '  distinct_work_items INT DEFAULT 0,',
    '  last_error TEXT',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_azure_ingest_runs_window ON azure_ingest_runs(window_from, window_to);',
    'CREATE TABLE IF NOT EXISTS azure_ingest_checkpoints (',
    '  checkpoint_key TEXT PRIMARY KEY,',
    '  run_id TEXT,',
    '  mode TEXT NOT NULL,',
    '  path_scope TEXT NOT NULL,',
    '  window_from DATE NOT NULL,',
    '  window_to DATE NOT NULL,',
    '  status TEXT NOT NULL,',
    '  last_changeset_id BIGINT,',
    '  processed_changesets INT DEFAULT 0,',
    '  updated_at TIMESTAMPTZ DEFAULT NOW(),',
    '  last_error TEXT',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_azure_ingest_cp_status ON azure_ingest_checkpoints(status, updated_at DESC);',
    'CREATE TABLE IF NOT EXISTS azure_file_history_signals (',
    '  file_path TEXT PRIMARY KEY,',
    '  module TEXT,',
    '  last_changeset_id BIGINT,',
    '  last_changed_at TIMESTAMPTZ,',
    '  last_author TEXT,',
    '  recent_changesets_count INT DEFAULT 0,',
    '  distinct_recent_authors INT DEFAULT 0,',
    '  top_recent_authors JSONB,',
    '  sample_changesets JSONB,',
    '  updated_at TIMESTAMPTZ DEFAULT NOW()',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_azure_file_history_module ON azure_file_history_signals(module);',
    'CREATE INDEX IF NOT EXISTS idx_azure_file_history_last_changed ON azure_file_history_signals(last_changed_at DESC);',
  ].join('\n');
}

function checkpointKey(mode: string, pathScope: string, windowFrom?: string, windowTo?: string): string {
  const wf = String(windowFrom || '').trim() || 'na';
  const wt = String(windowTo || '').trim() || 'na';
  return `${mode}::${pathScope}::${wf}::${wt}`;
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
  return await new Promise<string>((resolve, reject) => {
    const remoteCmd =
      `cd ${opts.remoteRepoPath} && ` +
      `docker compose exec -T postgres psql -U postgres -d ${opts.dbName} -v ON_ERROR_STOP=1`;
    const args = ['-i', opts.sshKeyPath, opts.sshTarget, remoteCmd];
    const cp = spawn('ssh', args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    cp.stdout.on('data', (d) => (stdout += String(d)));
    cp.stderr.on('data', (d) => (stderr += String(d)));
    cp.on('error', (e) => reject(e));
    cp.on('close', (code) => {
      if (code === 0) return resolve(stdout.trim());
      reject(new Error(stderr.trim() || stdout.trim() || `ssh exited with code ${code}`));
    });
    cp.stdin.write(sql, 'utf8');
    cp.stdin.end();
  });
}

async function runRemotePsqlScalar(sql: string, opts: { sshTarget: string; sshKeyPath: string; remoteRepoPath: string; dbName: string }): Promise<string> {
  const b64 = Buffer.from(sql, 'utf8').toString('base64');
  const cmd =
    `cd ${opts.remoteRepoPath} && ` +
    `python3 - <<'PY'\n` +
    `import base64,subprocess\n` +
    `sql=base64.b64decode('${b64}').decode('utf-8')\n` +
    `p=subprocess.run(['docker','compose','exec','-T','postgres','psql','-U','postgres','-d','${opts.dbName}','-At','-v','ON_ERROR_STOP=1','-c',sql],stdout=subprocess.PIPE,stderr=subprocess.STDOUT)\n` +
    `print(p.stdout.decode('utf-8',errors='ignore'))\n` +
    `raise SystemExit(p.returncode)\n` +
    `PY`;
  return await runSshCommand(cmd, opts);
}

async function getRemoteDiskUsagePercent(opts: { sshTarget: string; sshKeyPath: string; remoteRepoPath: string }): Promise<number | null> {
  try {
    const cmd = `df -P ${opts.remoteRepoPath} | tail -1`;
    const out = await runSshCommand(cmd, opts);
    const m = /\s(\d{1,3})%\s/.exec(out);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
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
      const fromComment = parseWorkItemIdsFromComment(comment);
      const fromRelations = parseWorkItemIdsFromChangesetDetail(detail as Record<string, unknown>);
      const relationSet = new Set<number>(fromRelations);
      const workItemLinks: Array<{ work_item_id: number; source: 'comment' | 'relation' }> = [];
      for (const wi of fromRelations) workItemLinks.push({ work_item_id: wi, source: 'relation' });
      for (const wi of fromComment) {
        if (!relationSet.has(wi)) workItemLinks.push({ work_item_id: wi, source: 'comment' });
      }
      const row: IngestRow = {
        changeset_id: id,
        path_scope: scope,
        author: pickAuthor(detail),
        created_at: String(detail.createdDate || detail.checkinDate || ''),
        comment,
        files,
        work_item_links: workItemLinks,
      };
      out.push(row);
      localProcessed += 1;
      totalFilesSeen += row.files.length;
      totalWiLinksSeen += row.work_item_links.length;
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
    runId?: string;
    mode?: 'bootstrap' | 'daily';
    windowFrom?: string;
    windowTo?: string;
    includeFileHistorySignals?: boolean;
    fileHistoryMaxFiles?: number;
    fileHistoryTopPerFile?: number;
    onProgress?: (p: IngestProgress) => void;
  }
): Promise<IngestSummary> {
  const mode = options.mode || 'bootstrap';
  const defaultPathScope = rows[0]?.path_scope || '(none)';
  const cpKey = checkpointKey(mode, defaultPathScope, options.windowFrom, options.windowTo);
  const BATCH_ROWS = 35;

  const diskUsage = await getRemoteDiskUsagePercent({
    sshTarget: options.sshTarget,
    sshKeyPath: options.sshKeyPath,
    remoteRepoPath: options.remoteRepoPath,
  });
  if (Number.isFinite(diskUsage as number)) {
    if ((diskUsage as number) >= 90) {
      throw new Error(`Remote disk usage is critical (${diskUsage}%). Expand disk before ingestion.`);
    }
    if ((diskUsage as number) >= 80) {
      options.onProgress?.({
        stage: 'preparing_sql',
        message: `Warning: remote disk usage is high (${diskUsage}%).`,
      });
    }
  }

  const bootstrapSql: string[] = ['BEGIN;', createSchemaSql()];
  if (options.runId) {
    bootstrapSql.push(
      `INSERT INTO azure_ingest_runs(run_id, mode, path_scope, window_from, window_to, status, started_at) VALUES (` +
        `${sqlLiteral(options.runId)}, ${sqlLiteral(mode)}, ${sqlLiteral(defaultPathScope)}, ${sqlLiteral(options.windowFrom || null)}, ${sqlLiteral(options.windowTo || null)}, 'running', NOW()) ` +
        `ON CONFLICT (run_id) DO UPDATE SET status='running', started_at=COALESCE(azure_ingest_runs.started_at, NOW()), last_error=NULL;`
    );
    bootstrapSql.push(
      `INSERT INTO azure_ingest_checkpoints(checkpoint_key, run_id, mode, path_scope, window_from, window_to, status, updated_at, processed_changesets, last_changeset_id) VALUES (` +
        `${sqlLiteral(cpKey)}, ${sqlLiteral(options.runId)}, ${sqlLiteral(mode)}, ${sqlLiteral(defaultPathScope)}, ${sqlLiteral(options.windowFrom || null)}, ${sqlLiteral(options.windowTo || null)}, 'running', NOW(), 0, NULL) ` +
        `ON CONFLICT (checkpoint_key) DO UPDATE SET run_id=EXCLUDED.run_id, status='running', updated_at=NOW(), last_error=NULL;`
    );
  }
  bootstrapSql.push('COMMIT;');
  await runRemotePsql(bootstrapSql.join('\n'), options);

  let ingestedFiles = 0;
  let ingestedLinks = 0;
  const distinctWi = new Set<number>();
  let csDone = 0;
  let fileHistorySignalsUpserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_ROWS) {
    const batch = rows.slice(i, i + BATCH_ROWS);
    const batchSql: string[] = ['BEGIN;'];
    const batchWi = new Set<number>();

    for (const r of batch) {
      const raw = {
        changeset_id: r.changeset_id,
        path_scope: r.path_scope,
        files_count: r.files.length,
        work_item_ids: r.work_item_links.map((x) => x.work_item_id),
        work_item_sources: r.work_item_links,
      };
      batchSql.push(
        `INSERT INTO azure_changesets(changeset_id, path_scope, author, created_at, comment, raw, ingested_at) VALUES (` +
          `${sqlLiteral(r.changeset_id)}, ${sqlLiteral(r.path_scope)}, ${sqlLiteral(r.author)}, ${sqlLiteral(r.created_at)}, ${sqlLiteral(r.comment)}, ${sqlJson(raw)}, NOW()) ` +
          `ON CONFLICT (changeset_id) DO UPDATE SET path_scope=EXCLUDED.path_scope, author=EXCLUDED.author, created_at=EXCLUDED.created_at, comment=EXCLUDED.comment, raw=EXCLUDED.raw, ingested_at=NOW();`
      );
      for (const f of r.files) {
        ingestedFiles += 1;
        batchSql.push(
          `INSERT INTO azure_changeset_files(changeset_id, file_path, change_type, module) VALUES (` +
            `${sqlLiteral(r.changeset_id)}, ${sqlLiteral(f.file_path)}, ${sqlLiteral(f.change_type)}, ${sqlLiteral(f.module)}) ` +
            `ON CONFLICT (changeset_id, file_path) DO UPDATE SET change_type=EXCLUDED.change_type, module=EXCLUDED.module;`
        );
      }
      for (const link of r.work_item_links) {
        const wi = link.work_item_id;
        ingestedLinks += 1;
        distinctWi.add(wi);
        batchWi.add(wi);
        batchSql.push(
          `INSERT INTO azure_changeset_work_items(changeset_id, work_item_id, source) VALUES (` +
            `${sqlLiteral(r.changeset_id)}, ${sqlLiteral(wi)}, ${sqlLiteral(link.source)}) ` +
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
      for (const wi of Array.from(batchWi)) {
        try {
          const item = await getWorkItem(wi);
          const compact = workItemToCompact(item as { id: number; fields?: Record<string, unknown> });
          batchSql.push(
            `INSERT INTO azure_work_items_cache(` +
              `work_item_id, title, state, type, changed_date, area_path, iteration_path, assigned_to, tags, severity, priority, description_text, expected_behavior_text, actual_behavior_text, repro_steps_text, raw, updated_at` +
            `) VALUES (` +
              `${sqlLiteral(wi)}, ${sqlLiteral(compact.title)}, ${sqlLiteral(compact.state)}, ${sqlLiteral(compact.type)}, ${sqlLiteral(compact.changed_date)}, ` +
              `${sqlLiteral(compact.area_path)}, ${sqlLiteral(compact.iteration_path)}, ${sqlLiteral(compact.assigned_to?.display_name || null)}, ${sqlLiteral(String((item.fields?.['System.Tags'] ?? '') || '').trim() || null)}, ` +
              `${sqlLiteral(compact.severity)}, ${sqlLiteral(compact.priority)}, ${sqlLiteral(compact.description_text)}, ${sqlLiteral(compact.expected_behavior_text)}, ${sqlLiteral(compact.actual_behavior_text)}, ${sqlLiteral(compact.repro_steps_text)}, ` +
              `${sqlJson(item)}, NOW()) ` +
              `ON CONFLICT (work_item_id) DO UPDATE SET ` +
              `title=EXCLUDED.title, state=EXCLUDED.state, type=EXCLUDED.type, changed_date=EXCLUDED.changed_date, ` +
              `area_path=EXCLUDED.area_path, iteration_path=EXCLUDED.iteration_path, assigned_to=EXCLUDED.assigned_to, tags=EXCLUDED.tags, ` +
              `severity=EXCLUDED.severity, priority=EXCLUDED.priority, description_text=EXCLUDED.description_text, ` +
              `expected_behavior_text=EXCLUDED.expected_behavior_text, actual_behavior_text=EXCLUDED.actual_behavior_text, repro_steps_text=EXCLUDED.repro_steps_text, ` +
              `raw=EXCLUDED.raw, updated_at=NOW();`
          );
        } catch {
          // best effort: keep ingest running even if one WI lookup fails
        }
      }
    }

    if (options.runId) {
      const lastChangeset = batch[batch.length - 1]?.changeset_id ?? null;
      batchSql.push(
        `UPDATE azure_ingest_checkpoints SET ` +
        `status='running', last_changeset_id=${sqlLiteral(lastChangeset)}, processed_changesets=${sqlLiteral(csDone)}, updated_at=NOW(), last_error=NULL ` +
        `WHERE checkpoint_key=${sqlLiteral(cpKey)};`
      );
      batchSql.push(
        `UPDATE azure_ingest_runs SET scanned_changesets=${sqlLiteral(csDone)}, ingested_changesets=${sqlLiteral(csDone)}, ` +
        `ingested_files=${sqlLiteral(ingestedFiles)}, ingested_work_item_links=${sqlLiteral(ingestedLinks)}, distinct_work_items=${sqlLiteral(distinctWi.size)} ` +
        `WHERE run_id=${sqlLiteral(options.runId)};`
      );
    }

    batchSql.push('COMMIT;');
    options.onProgress?.({
      stage: 'writing_remote',
      changesets_seen: csDone,
      changesets_total_estimate: rows.length,
      files_seen: ingestedFiles,
      work_item_links_seen: ingestedLinks,
      message: `Writing remote batch ${Math.floor(i / BATCH_ROWS) + 1}/${Math.ceil(rows.length / BATCH_ROWS)}...`,
    });
    await runRemotePsql(batchSql.join('\n'), options);
  }

  if (options.runId) {
    const lastChangeset = rows.length > 0 ? rows[rows.length - 1].changeset_id : null;
    const finalSql = [
      'BEGIN;',
      `UPDATE azure_ingest_runs SET ` +
        `status='completed', finished_at=NOW(), scanned_changesets=${sqlLiteral(rows.length)}, ingested_changesets=${sqlLiteral(rows.length)}, ` +
        `ingested_files=${sqlLiteral(ingestedFiles)}, ingested_work_item_links=${sqlLiteral(ingestedLinks)}, distinct_work_items=${sqlLiteral(distinctWi.size)}, last_error=NULL ` +
        `WHERE run_id=${sqlLiteral(options.runId)};`,
      `UPDATE azure_ingest_checkpoints SET ` +
        `status='completed', last_changeset_id=${sqlLiteral(lastChangeset)}, processed_changesets=${sqlLiteral(rows.length)}, updated_at=NOW(), last_error=NULL ` +
        `WHERE checkpoint_key=${sqlLiteral(cpKey)};`,
      'COMMIT;',
    ].join('\n');
    await runRemotePsql(finalSql, options);
  }

  if (options.includeFileHistorySignals === true) {
    const maxFiles = Math.min(Math.max(1, options.fileHistoryMaxFiles ?? 120), 500);
    const topPerFile = Math.min(Math.max(5, options.fileHistoryTopPerFile ?? 40), 120);
    const fileCounts = new Map<string, number>();
    for (const r of rows) {
      for (const f of r.files) {
        const p = String(f.file_path || '').trim();
        if (!p) continue;
        fileCounts.set(p, (fileCounts.get(p) || 0) + 1);
      }
    }
    const ranked = Array.from(fileCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxFiles)
      .map((x) => x[0]);

    if (ranked.length > 0) {
      const signalRows: Array<{
        file_path: string;
        module: string;
        last_changeset_id: number | null;
        last_changed_at: string | null;
        last_author: string | null;
        recent_changesets_count: number;
        distinct_recent_authors: number;
        top_recent_authors: unknown;
        sample_changesets: unknown;
      }> = [];

      for (let i = 0; i < ranked.length; i++) {
        const filePath = ranked[i];
        let history: Awaited<ReturnType<typeof listChangesetsByItemPath>> = [];
        try {
          history = await listChangesetsByItemPath({
            itemPath: filePath,
            top: topPerFile,
          });
        } catch {
          history = [];
        }
        const authors = new Map<string, number>();
        for (const cs of history) {
          const a = pickAuthor(cs);
          authors.set(a, (authors.get(a) || 0) + 1);
        }
        const topAuthors = Array.from(authors.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({ name, count }));
        const first = history[0];
        signalRows.push({
          file_path: filePath,
          module: moduleFromPath(filePath),
          last_changeset_id: first?.changesetId ?? null,
          last_changed_at: String(first?.createdDate || first?.checkinDate || '').trim() || null,
          last_author: first ? pickAuthor(first) : null,
          recent_changesets_count: history.length,
          distinct_recent_authors: authors.size,
          top_recent_authors: topAuthors,
          sample_changesets: history.slice(0, 8).map((cs) => ({
            changeset_id: cs.changesetId,
            created_at: cs.createdDate || cs.checkinDate || null,
            author: pickAuthor(cs),
            comment: String(cs.comment || '').slice(0, 160),
          })),
        });

        options.onProgress?.({
          stage: 'enriching',
          changesets_seen: i + 1,
          changesets_total_estimate: ranked.length,
          message: `Collecting file-history signals ${i + 1}/${ranked.length}`,
        });
      }

      const SIGNAL_BATCH = 40;
      for (let i = 0; i < signalRows.length; i += SIGNAL_BATCH) {
        const batch = signalRows.slice(i, i + SIGNAL_BATCH);
        const sqlBatch: string[] = ['BEGIN;'];
        for (const s of batch) {
          sqlBatch.push(
            `INSERT INTO azure_file_history_signals(` +
              `file_path, module, last_changeset_id, last_changed_at, last_author, recent_changesets_count, distinct_recent_authors, top_recent_authors, sample_changesets, updated_at` +
            `) VALUES (` +
              `${sqlLiteral(s.file_path)}, ${sqlLiteral(s.module)}, ${sqlLiteral(s.last_changeset_id)}, ${sqlLiteral(s.last_changed_at)}, ${sqlLiteral(s.last_author)}, ` +
              `${sqlLiteral(s.recent_changesets_count)}, ${sqlLiteral(s.distinct_recent_authors)}, ${sqlJson(s.top_recent_authors)}, ${sqlJson(s.sample_changesets)}, NOW()) ` +
            `ON CONFLICT (file_path) DO UPDATE SET ` +
              `module=EXCLUDED.module, last_changeset_id=EXCLUDED.last_changeset_id, last_changed_at=EXCLUDED.last_changed_at, last_author=EXCLUDED.last_author, ` +
              `recent_changesets_count=EXCLUDED.recent_changesets_count, distinct_recent_authors=EXCLUDED.distinct_recent_authors, ` +
              `top_recent_authors=EXCLUDED.top_recent_authors, sample_changesets=EXCLUDED.sample_changesets, updated_at=NOW();`
          );
        }
        sqlBatch.push('COMMIT;');
        await runRemotePsql(sqlBatch.join('\n'), options);
        fileHistorySignalsUpserted += batch.length;
      }
    }
  }

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
    file_history_signals_upserted: fileHistorySignalsUpserted,
  };
}

export async function markRemoteIngestFailed(options: {
  sshTarget: string;
  sshKeyPath: string;
  remoteRepoPath: string;
  dbName: string;
  runId?: string;
  mode?: 'bootstrap' | 'daily';
  pathScope?: string;
  windowFrom?: string;
  windowTo?: string;
  errorMessage: string;
}): Promise<void> {
  if (!options.runId) return;
  const mode = options.mode || 'bootstrap';
  const pathScope = String(options.pathScope || '(none)');
  const cpKey = checkpointKey(mode, pathScope, options.windowFrom, options.windowTo);
  const sql = [
    'BEGIN;',
    createSchemaSql(),
    `INSERT INTO azure_ingest_runs(run_id, mode, path_scope, window_from, window_to, status, started_at, finished_at, last_error) VALUES (` +
      `${sqlLiteral(options.runId)}, ${sqlLiteral(mode)}, ${sqlLiteral(pathScope)}, ${sqlLiteral(options.windowFrom || null)}, ${sqlLiteral(options.windowTo || null)}, 'failed', NOW(), NOW(), ${sqlLiteral(options.errorMessage)}) ` +
      `ON CONFLICT (run_id) DO UPDATE SET status='failed', finished_at=NOW(), last_error=${sqlLiteral(options.errorMessage)};`,
    `INSERT INTO azure_ingest_checkpoints(checkpoint_key, run_id, mode, path_scope, window_from, window_to, status, updated_at, last_error) VALUES (` +
      `${sqlLiteral(cpKey)}, ${sqlLiteral(options.runId)}, ${sqlLiteral(mode)}, ${sqlLiteral(pathScope)}, ${sqlLiteral(options.windowFrom || null)}, ${sqlLiteral(options.windowTo || null)}, 'failed', NOW(), ${sqlLiteral(options.errorMessage)}) ` +
      `ON CONFLICT (checkpoint_key) DO UPDATE SET status='failed', updated_at=NOW(), last_error=${sqlLiteral(options.errorMessage)}, run_id=EXCLUDED.run_id;`,
    'COMMIT;',
  ].join('\n');
  await runRemotePsql(sql, {
    sshTarget: options.sshTarget,
    sshKeyPath: options.sshKeyPath,
    remoteRepoPath: options.remoteRepoPath,
    dbName: options.dbName,
  });
}

export async function isRemoteCheckpointCompleted(options: {
  sshTarget: string;
  sshKeyPath: string;
  remoteRepoPath: string;
  dbName: string;
  mode: 'bootstrap' | 'daily';
  pathScope: string;
  windowFrom?: string;
  windowTo?: string;
}): Promise<boolean> {
  const key = checkpointKey(options.mode, options.pathScope, options.windowFrom, options.windowTo);
  const sql =
    `SELECT COALESCE((SELECT status FROM azure_ingest_checkpoints WHERE checkpoint_key=${sqlLiteral(key)} LIMIT 1),'')`; 
  try {
    const out = await runRemotePsqlScalar(sql, {
      sshTarget: options.sshTarget,
      sshKeyPath: options.sshKeyPath,
      remoteRepoPath: options.remoteRepoPath,
      dbName: options.dbName,
    });
    return out.trim().toLowerCase() === 'completed';
  } catch {
    return false;
  }
}
