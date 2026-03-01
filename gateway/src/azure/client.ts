/**
 * Azure DevOps (Server) API client for MCP tools.
 * Work Items (WIQL, batch), TFVC changesets, changeset changes, file content at changeset.
 * Config: AZURE_DEVOPS_BASE_URL, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT in .env.
 */

const API_VER = (process.env.AZURE_DEVOPS_API_VERSION || '7.0').trim();

function getConfig(): { baseUrl: string; project: string; pat: string } {
  const baseUrl = (process.env.AZURE_DEVOPS_BASE_URL || '').trim();
  const project = (process.env.AZURE_DEVOPS_PROJECT || '').trim();
  const pat = (process.env.AZURE_DEVOPS_PAT || '').trim();
  return { baseUrl, project, pat };
}

function authHeader(pat: string): string {
  return 'Basic ' + Buffer.from(':' + pat, 'utf8').toString('base64');
}

function cleanBase(url: string): string {
  return String(url).trim().replace(/\/+$/g, '');
}

function joinUrl(base: string, ...parts: (string | number)[]): string {
  const b = cleanBase(base);
  const p = parts
    .map((x) => String(x).trim().replace(/^\/+/g, '').replace(/\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return p ? `${b}/${p}` : b;
}

export function hasAzureDevOpsConfig(): boolean {
  const { baseUrl, project, pat } = getConfig();
  return !!(baseUrl && project && pat);
}

function ensureConfig(): { baseUrl: string; project: string; pat: string } {
  const c = getConfig();
  if (!c.baseUrl || !c.project || !c.pat) {
    throw new Error(
      'AZURE_DEVOPS_BASE_URL, AZURE_DEVOPS_PROJECT, and AZURE_DEVOPS_PAT must be set in .env.'
    );
  }
  return c;
}

function formatFetchFailure(err: unknown): string {
  const e = err as any;
  const topMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const topCode = typeof e?.code === 'string' ? e.code : '';
  const cause = e?.cause;
  const causeMsg = cause
    ? (cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause))
    : '';
  const causeCode = typeof cause?.code === 'string' ? cause.code : '';
  const parts: string[] = [topMsg];
  if (topCode) parts.push(`code=${topCode}`);
  if (causeMsg) parts.push(`cause=${causeMsg}`);
  if (causeCode && causeCode !== topCode) parts.push(`cause_code=${causeCode}`);
  return parts.join(' | ');
}

async function httpJson<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const { pat } = ensureConfig();
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        Authorization: authHeader(pat),
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(options.headers as Record<string, string>),
      },
    });
  } catch (err) {
    // Network/TLS/DNS errors from fetch (undici) often surface as "fetch failed" without details.
    // Include URL + cause code so callers can troubleshoot (VPN, firewall, wrong host/port).
    throw new Error(`Azure DevOps request failed (fetch). URL: ${url}. ${formatFetchFailure(err)}`);
  }
  const text = await res.text();
  let data: T;
  try {
    data = (text ? JSON.parse(text) : null) as T;
  } catch {
    data = text as unknown as T;
  }
  if (!res.ok) {
    throw new Error(
      `Azure DevOps HTTP ${res.status} ${res.statusText}\nURL: ${url}\n` +
        (typeof data === 'string' ? data : JSON.stringify(data, null, 2))
    );
  }
  return data;
}

/** JSON Patch operation for work item update. */
export interface JsonPatchOp {
  op: 'add' | 'replace' | 'remove' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

/** PATCH work item with JSON Patch operations. Returns updated work item. */
export async function updateWorkItem(
  id: number,
  patch: JsonPatchOp[]
): Promise<{ id: number; rev?: number; fields?: Record<string, unknown>; [k: string]: unknown }> {
  const { baseUrl, project } = ensureConfig();
  const url =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/workitems', id) +
    `?api-version=${encodeURIComponent(API_VER)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader(ensureConfig().pat),
      'Content-Type': 'application/json-patch+json',
      Accept: 'application/json',
    },
    body: JSON.stringify(patch),
  });
  const text = await res.text();
  let data: { id?: number; rev?: number; fields?: Record<string, unknown> };
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(
      `Azure DevOps PATCH ${res.status} ${res.statusText}\nURL: ${url}\n` + (text || res.statusText)
    );
  }
  return data as { id: number; rev?: number; fields?: Record<string, unknown>; [k: string]: unknown };
}

/** Update one or more fields on a work item. Field names must be full ref names (e.g. System.Description, Custom.PossibleCause). */
export async function updateWorkItemFields(
  id: number,
  fields: Record<string, string>
): Promise<{ id: number; rev?: number; fields?: Record<string, unknown> }> {
  const ops: JsonPatchOp[] = Object.entries(fields).map(([name, value]) => ({
    op: 'add',
    path: `/fields/${name}`,
    value,
  }));
  return updateWorkItem(id, ops);
}

type IdentityLike = { displayName?: string; uniqueName?: string; id?: string; name?: string; [k: string]: unknown };

export type WorkItemBatchValue = {
  id: number;
  url?: string;
  fields?: Record<string, unknown>;
  relations?: { rel?: string; url?: string; attributes?: Record<string, unknown> }[];
  [k: string]: unknown;
};

export type WorkItemUpdate = {
  id?: number;
  rev?: number;
  revisedBy?: IdentityLike;
  revisedDate?: string;
  fields?: Record<string, { oldValue?: unknown; newValue?: unknown }>;
  [k: string]: unknown;
};

export interface ListWorkItemsOptions {
  top?: number;
  type?: string;
  states?: string[];
  year?: number;
  assignedTo?: string;
  assignedToMe?: boolean;
}

function wiqlListQuery(opts: ListWorkItemsOptions): string {
  const type = (opts.type || '').trim();
  const states = opts.states || [];
  const assignedTo = (opts.assignedTo || '').trim();
  const year = opts.year;
  const parts: string[] = [];
  parts.push("SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.ChangedDate] FROM WorkItems");
  const where: string[] = [];
  if (type) where.push(`[System.WorkItemType] = '${type.replace(/'/g, "''")}'`);
  if (states.length > 0) {
    const list = states.map((s) => `'${String(s).replace(/'/g, "''")}'`).join(', ');
    where.push(`[System.State] IN (${list})`);
  }
  if (assignedTo) {
    where.push(`[System.AssignedTo] CONTAINS '${assignedTo.replace(/'/g, "''")}'`);
  } else if (opts.assignedToMe) {
    where.push(`[System.AssignedTo] = @Me`);
  }
  if (year) {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    where.push(`[System.ChangedDate] >= '${from}' AND [System.ChangedDate] <= '${to}'`);
  }
  if (where.length > 0) parts.push('WHERE ' + where.join(' AND '));
  parts.push('ORDER BY [System.ChangedDate] DESC');
  return parts.join(' ');
}

export async function listWorkItems(opts: ListWorkItemsOptions): Promise<WorkItemBatchValue[]> {
  const { baseUrl, project } = ensureConfig();
  const top = Math.min(Math.max(1, opts.top ?? 50), 200);
  const url =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/wiql') +
    `?api-version=${encodeURIComponent(API_VER)}`;
  const wiql = wiqlListQuery(opts);
  const data = await httpJson<{ workItems?: { id: number }[] }>(url, {
    method: 'POST',
    body: JSON.stringify({ query: wiql }),
  });
  const ids = (data.workItems || []).map((w) => w.id).slice(0, top);
  if (ids.length === 0) return [];
  return getWorkItemsBatch(ids);
}

export async function getWorkItem(id: number): Promise<WorkItemBatchValue> {
  const { baseUrl, project } = ensureConfig();
  const url =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/workitems', id) +
    `?$expand=relations&api-version=${encodeURIComponent(API_VER)}`;
  return httpJson<WorkItemBatchValue>(url);
}

export async function getWorkItemWithRelations(id: number): Promise<WorkItemBatchValue> {
  return getWorkItem(id);
}

export async function getWorkItemUpdates(
  id: number,
  top: number = 50
): Promise<{ value: WorkItemUpdate[] }> {
  const { baseUrl, project } = ensureConfig();
  const wanted = Math.min(Math.max(1, top), 200);
  const url =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/workitems', id, 'updates') +
    `?$top=${wanted}&api-version=${encodeURIComponent(API_VER)}`;
  return httpJson<{ value: WorkItemUpdate[] }>(url);
}

export function extractChangesetIds(wi: WorkItemBatchValue): number[] {
  const rels = wi.relations || [];
  const ids: number[] = [];
  for (const r of rels) {
    const url = String(r.url || '');
    const m = /changesets\/(\d+)/i.exec(url);
    if (m) ids.push(parseInt(m[1], 10));
  }
  return Array.from(new Set(ids)).filter((n) => Number.isFinite(n) && n > 0);
}

export type TfvcChangeset = {
  changesetId: number;
  author?: IdentityLike;
  checkedInBy?: IdentityLike;
  createdDate?: string;
  checkinDate?: string;
  comment?: string;
  [k: string]: unknown;
};

export type TfvcChangesetChange = {
  changeType?: string;
  item?: { path?: string; serverItem?: string; url?: string; [k: string]: unknown };
  [k: string]: unknown;
};

function tfvcProjectPath(project?: string): string {
  const p = (project || '').trim().toLowerCase();
  if (p === 'blueivory' || p === 'bi') {
    // Keep default empty so environments without correct TFVC paths don't hard-fail.
    // If you want itemPath scoping, set AZURE_DEVOPS_TFVC_PATH_BLUEIVORY explicitly.
    return (process.env.AZURE_DEVOPS_TFVC_PATH_BLUEIVORY || '').trim();
  }
  if (p === 'core' || p === 'classic') {
    // If you want itemPath scoping, set AZURE_DEVOPS_TFVC_PATH_CORE explicitly.
    return (process.env.AZURE_DEVOPS_TFVC_PATH_CORE || '').trim();
  }
  return '';
}

export async function listChangesets(options: {
  project?: string;
  author?: string;
  fromDate?: string;
  toDate?: string;
  top?: number;
  skip?: number;
}): Promise<TfvcChangeset[]> {
  const { baseUrl, project } = ensureConfig();
  const top = Math.min(Math.max(1, options.top ?? 100), 1000);
  const skip = Math.max(0, options.skip ?? 0);
  const q = new URLSearchParams();
  q.set('api-version', API_VER);
  q.set('$top', String(top));
  if (skip) q.set('$skip', String(skip));
  const tfvcPath = tfvcProjectPath(options.project);
  if (tfvcPath) q.set('searchCriteria.itemPath', tfvcPath);
  if (options.author?.trim()) q.set('searchCriteria.author', options.author.trim());
  if (options.fromDate?.trim()) q.set('searchCriteria.fromDate', options.fromDate.trim());
  if (options.toDate?.trim()) q.set('searchCriteria.toDate', options.toDate.trim());
  const url = joinUrl(baseUrl, encodeURIComponent(project), '_apis/tfvc/changesets') + `?${q.toString()}`;
  const data = await httpJson<{ value?: TfvcChangeset[] }>(url);
  return data.value ?? [];
}

export async function getChangesetCount(options: {
  project?: string;
  author?: string;
  fromDate?: string;
  toDate?: string;
  maxCount?: number;
}): Promise<{ count: number; truncated: boolean }> {
  const wanted = Math.min(Math.max(1, options.maxCount ?? 100000), 500000);
  const pageSize = 1000;
  let count = 0;
  let skip = 0;
  while (count < wanted) {
    const toFetch = Math.min(pageSize, wanted - count);
    const page = await listChangesets({
      project: options.project,
      author: options.author,
      fromDate: options.fromDate,
      toDate: options.toDate,
      top: toFetch,
      skip,
    });
    count += page.length;
    if (page.length < toFetch) return { count, truncated: false };
    skip += page.length;
  }
  return { count, truncated: true };
}

export async function getChangeset(changesetId: number): Promise<TfvcChangeset> {
  const { baseUrl, project } = ensureConfig();
  const url =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/tfvc/changesets', changesetId) +
    `?api-version=${encodeURIComponent(API_VER)}`;
  return httpJson<TfvcChangeset>(url);
}

export async function getChangesetChanges(changesetId: number): Promise<{ value?: TfvcChangesetChange[] }> {
  const { baseUrl, project } = ensureConfig();
  const url =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/tfvc/changesets', changesetId, 'changes') +
    `?api-version=${encodeURIComponent(API_VER)}`;
  return httpJson<{ value?: TfvcChangesetChange[] }>(url);
}

export async function getChangesetFileDiff(
  tfvcPath: string,
  changesetId: number
): Promise<{ diff: { t: string; s: string }[]; prevCs: number; currentCs: number; isNewFile: boolean }> {
  const { baseUrl, project } = ensureConfig();
  const q = new URLSearchParams();
  q.set('api-version', API_VER);
  q.set('path', tfvcPath);
  q.set('version', `C${changesetId}`);
  q.set('previousVersion', `C${changesetId - 1}`);
  const url = joinUrl(baseUrl, encodeURIComponent(project), '_apis/tfvc/diffs') + `?${q.toString()}`;
  const data = await httpJson<{ diffBlocks?: unknown[]; [k: string]: unknown }>(url);
  const blocks = (data as unknown as { diffBlocks?: any[] }).diffBlocks || [];
  const diff: { t: string; s: string }[] = [];
  for (const b of blocks) {
    const lines = (b?.lines || []) as any[];
    for (const l of lines) {
      const t = String(l?.type || '');
      const s = String(l?.text || '');
      if (t && s !== undefined) diff.push({ t, s });
    }
  }
  // Best-effort detection for new files: if the API returns empty diff and previousVersion < 0 or not found, caller treats as new.
  const isNewFile = diff.length === 0;
  return { diff, prevCs: changesetId - 1, currentCs: changesetId, isNewFile };
}

export function pickAuthor(cs: TfvcChangeset): string {
  const a = (cs.author || cs.checkedInBy) as IdentityLike | undefined;
  const display = a?.displayName || a?.name || a?.uniqueName || '';
  return String(display || '').trim() || '?';
}

export async function listChangesetAuthors(maxScan: number = 2000, project?: string): Promise<string[]> {
  const wanted = Math.min(Math.max(1, maxScan), 100000);
  const pageSize = 1000;
  const seen = new Set<string>();
  let skip = 0;
  while (skip < wanted) {
    const toFetch = Math.min(pageSize, wanted - skip);
    const page = await listChangesets({ project, top: toFetch, skip });
    for (const cs of page) {
      const name = pickAuthor(cs);
      if (name && name !== '?') seen.add(name);
    }
    if (page.length < toFetch) break;
    skip += page.length;
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

export interface ListWorkItemsByDateRangeOptions {
  /** Date string (inclusive). Prefer YYYY-MM-DD for Azure DevOps Server WIQL. */
  fromDate: string;
  /** Date string (inclusive). Prefer YYYY-MM-DD for Azure DevOps Server WIQL. */
  toDate: string;
  top?: number;
  skip?: number;
  assignedTo?: string;
  assignedToMe?: boolean;
  /** Which date field to filter on. */
  dateField?: 'created' | 'changed';
}

function wiqlDateRangeQuery(options: ListWorkItemsByDateRangeOptions): string {
  const from = options.fromDate;
  const to = options.toDate;
  const assignedTo = (options.assignedTo || '').trim();
  const dateField = options.dateField === 'changed' ? 'System.ChangedDate' : 'System.CreatedDate';
  const where: string[] = [];
  where.push(`[${dateField}] >= '${from.replace(/'/g, "''")}'`);
  where.push(`[${dateField}] <= '${to.replace(/'/g, "''")}'`);
  if (assignedTo) {
    where.push(`[System.AssignedTo] CONTAINS '${assignedTo.replace(/'/g, "''")}'`);
  } else if (options.assignedToMe) {
    where.push(`[System.AssignedTo] = @Me`);
  }
  const parts: string[] = [];
  parts.push('SELECT [System.Id] FROM WorkItems');
  parts.push('WHERE ' + where.join(' AND '));
  parts.push(`ORDER BY [${dateField}] DESC`);
  return parts.join(' ');
}

async function getWorkItemsBatch(ids: number[]): Promise<WorkItemBatchValue[]> {
  const { baseUrl, project } = ensureConfig();
  const url =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/workitemsbatch') +
    `?api-version=${encodeURIComponent(API_VER)}`;
  const data = await httpJson<{ value?: WorkItemBatchValue[] }>(url, {
    method: 'POST',
    body: JSON.stringify({ ids, $expand: 'relations' }),
  });
  return data.value ?? [];
}

export async function listWorkItemsByDateRange(options: ListWorkItemsByDateRangeOptions): Promise<WorkItemBatchValue[]> {
  const { baseUrl, project } = ensureConfig();
  const top = Math.min(Math.max(1, options.top ?? 50), 200);
  const skip = Math.max(0, options.skip ?? 0);
  const url =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/wiql') +
    `?api-version=${encodeURIComponent(API_VER)}`;
  const wiql = wiqlDateRangeQuery(options);
  const data = await httpJson<{ workItems?: { id: number }[] }>(url, {
    method: 'POST',
    body: JSON.stringify({ query: wiql }),
  });
  const ids = (data.workItems || []).map((w) => w.id).slice(skip, skip + top);
  if (ids.length === 0) return [];
  return getWorkItemsBatch(ids);
}

export async function addWorkItemCommentAsMarkdown(workItemId: number, commentText: string): Promise<void> {
  const ops: JsonPatchOp[] = [
    {
      op: 'add',
      path: '/fields/System.History',
      value: commentText,
    },
  ];
  await updateWorkItem(workItemId, ops);
}

