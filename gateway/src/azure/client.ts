/**
 * Azure DevOps (Server) API client for MCP tools.
 * Work Items (WIQL, batch), TFVC changesets, changeset changes, file content at changeset.
 * Config: AZURE_DEVOPS_BASE_URL, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT in .env.
 * Optional: Azure tunnel (WebSocket client from local machine) when instance has no PAT.
 */

import { isTunnelReady, requestViaTunnel } from './tunnel-server';

const API_VER = (process.env.AZURE_DEVOPS_API_VERSION || '7.0').trim();
/** Request timeout in ms (0 = no timeout). Avoids MCP tools hanging when Azure is unreachable (e.g. VPN off). */
const FETCH_TIMEOUT_MS = Math.max(0, Math.min(120_000, Number(process.env.AZURE_DEVOPS_TIMEOUT_MS) || 30_000));

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
  return !!(baseUrl && project && (pat || isTunnelReady()));
}

function ensureConfig(): { baseUrl: string; project: string; pat: string } {
  const c = getConfig();
  if (!c.baseUrl || !c.project) {
    throw new Error('AZURE_DEVOPS_BASE_URL and AZURE_DEVOPS_PROJECT must be set in .env.');
  }
  if (!c.pat && !isTunnelReady()) {
    throw new Error('Set AZURE_DEVOPS_PAT (direct) or connect the Azure tunnel client (WebSocket).');
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

type AzureFetchResult = {
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
  contentType: string;
  /** Response headers (e.g. x-ms-continuationtoken for WIQL). Direct fetch only; tunnel returns {}. */
  headers: Record<string, string>;
};

/** Use tunnel when connected, otherwise direct PAT. */
async function azureFetch(url: string, options: RequestInit = {}): Promise<AzureFetchResult> {
  const c = ensureConfig();
  if (isTunnelReady()) {
    try {
      const r = await requestViaTunnel(url, options);
      return { ...r, headers: {} };
    } catch (err) {
      throw new Error(
        `Azure tunnel request failed. ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  const auth = authHeader(c.pat);
  const fetchOptions: RequestInit = {
    ...options,
    headers: {
      ...(options.headers as Record<string, string>),
      Authorization: auth,
    },
  };
  if (FETCH_TIMEOUT_MS > 0 && !fetchOptions.signal) {
    fetchOptions.signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  }
  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch (err) {
    throw new Error(`Azure DevOps request failed (fetch). URL: ${url}. ${formatFetchFailure(err)}`);
  }
  const text = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    text,
    contentType: String(res.headers.get('content-type') || ''),
    headers,
  };
}

async function httpJson<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const r = await azureFetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });
  let data: T;
  try {
    data = (r.text ? JSON.parse(r.text) : null) as T;
  } catch {
    data = r.text as unknown as T;
  }
  if (!r.ok) {
    throw new Error(
      `Azure DevOps HTTP ${r.status} ${r.statusText}\nURL: ${url}\n` +
        (typeof data === 'string' ? data : JSON.stringify(data, null, 2))
    );
  }
  return data;
}

function isTfvcProjectScoped404(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Azure DevOps Server sometimes returns a plain HTML "Page not found." for TFVC endpoints
  // when using the project-scoped route.
  return msg.includes('Azure DevOps HTTP 404') && msg.toLowerCase().includes('page not found');
}

async function httpJsonTfvcWithFallback<T = unknown>(
  projectScopedUrl: string,
  collectionScopedUrl: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    return await httpJson<T>(projectScopedUrl, options);
  } catch (err) {
    if (!isTfvcProjectScoped404(err)) throw err;
    return await httpJson<T>(collectionScopedUrl, options);
  }
}

async function httpTextTfvcWithFallback(
  projectScopedUrl: string,
  collectionScopedUrl: string
): Promise<string> {
  const a = await azureFetch(projectScopedUrl, { headers: { Accept: '*/*' } });
  if (a.ok) return a.text;
  const msgA = `Azure DevOps HTTP ${a.status} ${a.statusText}\nURL: ${projectScopedUrl}\n${a.text || a.statusText}`;
  if (a.status === 404 && a.text.toLowerCase().includes('page not found')) {
    const b = await azureFetch(collectionScopedUrl, { headers: { Accept: '*/*' } });
    if (b.ok) return b.text;
    throw new Error(`Azure DevOps HTTP ${b.status} ${b.statusText}\nURL: ${collectionScopedUrl}\n${b.text || b.statusText}`);
  }
  throw new Error(msgA);
}

function pickTfvcItemContent(raw: string, contentType: string): string {
  const ct = contentType.toLowerCase();
  if (!ct.includes('application/json')) return raw;
  try {
    const data = JSON.parse(raw);
    if (typeof data?.content === 'string') return data.content;
    // Some servers wrap in an object under "value".
    if (typeof data?.value?.content === 'string') return data.value.content;
  } catch {
    // fall through
  }
  return raw;
}

export async function getTfvcItemTextAtChangeset(tfvcPath: string, changesetId: number): Promise<string> {
  const { baseUrl, project } = ensureConfig();
  const q = new URLSearchParams();
  q.set('api-version', API_VER);
  q.set('path', tfvcPath);
  q.set('version', `C${changesetId}`);
  q.set('includeContent', 'true');
  const projectScopedUrl = joinUrl(baseUrl, encodeURIComponent(project), '_apis/tfvc/items') + `?${q.toString()}`;
  const collectionScopedUrl = joinUrl(baseUrl, '_apis/tfvc/items') + `?${q.toString()}`;

  const a = await azureFetch(projectScopedUrl, {
    headers: { Accept: 'application/json, text/plain, */*' },
  });
  if (a.ok) return pickTfvcItemContent(a.text, a.contentType);
  if (a.status === 404 && a.text.toLowerCase().includes('page not found')) {
    const b = await azureFetch(collectionScopedUrl, {
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    if (b.ok) return pickTfvcItemContent(b.text, b.contentType);
    throw new Error(`Azure DevOps HTTP ${b.status} ${b.statusText}\nURL: ${collectionScopedUrl}\n${b.text || b.statusText}`);
  }
  throw new Error(`Azure DevOps HTTP ${a.status} ${a.statusText}\nURL: ${projectScopedUrl}\n${a.text || a.statusText}`);
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
  const r = await azureFetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json-patch+json',
      Accept: 'application/json',
    },
    body: JSON.stringify(patch),
  });
  let data: { id?: number; rev?: number; fields?: Record<string, unknown> };
  try {
    data = r.text ? JSON.parse(r.text) : {};
  } catch {
    data = {};
  }
  if (!r.ok) {
    throw new Error(
      `Azure DevOps PATCH ${r.status} ${r.statusText}\nURL: ${url}\n` + (r.text || r.statusText)
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
    `?$top=${top}&api-version=${encodeURIComponent(API_VER)}`;
  const wiql = wiqlListQuery(opts);
  const ids = await wiqlCollectIds(url, { query: wiql }, top);
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
    const url = String(r.url || '').trim();
    if (!url) continue;

    const patterns: RegExp[] = [
      /changesets\/(\d+)/i, // .../changesets/123
      /changeset\/(\d+)/i, // .../changeset/123
      /versioncontrol\/changeset\/(\d+)/i, // vstfs:///VersionControl/Changeset/123
      /changesetId=(\d+)/i, // ...?changesetId=123
    ];
    for (const re of patterns) {
      const m = re.exec(url);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) ids.push(n);
    }
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

export type AzureGitRepository = {
  id?: string;
  name?: string;
  defaultBranch?: string;
  remoteUrl?: string;
  webUrl?: string;
  size?: number;
  project?: { id?: string; name?: string; [k: string]: unknown };
  [k: string]: unknown;
};

export type TfvcItemEntry = {
  path: string;
  isFolder: boolean;
  changesetVersion?: string;
  contentLength?: number;
  url?: string;
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
  const projectScopedUrl = joinUrl(baseUrl, encodeURIComponent(project), '_apis/tfvc/changesets') + `?${q.toString()}`;
  const collectionScopedUrl = joinUrl(baseUrl, '_apis/tfvc/changesets') + `?${q.toString()}`;
  const data = await httpJsonTfvcWithFallback<{ value?: TfvcChangeset[] }>(projectScopedUrl, collectionScopedUrl);
  return data.value ?? [];
}

export async function listChangesetsByItemPath(options: {
  itemPath: string;
  author?: string;
  fromDate?: string;
  toDate?: string;
  top?: number;
  skip?: number;
  projectName?: string;
}): Promise<TfvcChangeset[]> {
  const { baseUrl, project } = ensureConfig();
  const top = Math.min(Math.max(1, options.top ?? 100), 1000);
  const skip = Math.max(0, options.skip ?? 0);
  const itemPath = String(options.itemPath || '').trim();
  if (!itemPath) throw new Error('itemPath is required');

  const q = new URLSearchParams();
  q.set('api-version', API_VER);
  q.set('$top', String(top));
  if (skip) q.set('$skip', String(skip));
  q.set('searchCriteria.itemPath', itemPath);
  if (options.author?.trim()) q.set('searchCriteria.author', options.author.trim());
  if (options.fromDate?.trim()) q.set('searchCriteria.fromDate', options.fromDate.trim());
  if (options.toDate?.trim()) q.set('searchCriteria.toDate', options.toDate.trim());

  const projectForUrl = (options.projectName || project || '').trim();
  const projectScopedUrl = joinUrl(baseUrl, encodeURIComponent(projectForUrl), '_apis/tfvc/changesets') + `?${q.toString()}`;
  const collectionScopedUrl = joinUrl(baseUrl, '_apis/tfvc/changesets') + `?${q.toString()}`;
  const data = await httpJsonTfvcWithFallback<{ value?: TfvcChangeset[] }>(projectScopedUrl, collectionScopedUrl);
  return data.value ?? [];
}

export async function listGitRepositories(projectName?: string): Promise<AzureGitRepository[]> {
  const { baseUrl, project } = ensureConfig();
  const q = new URLSearchParams();
  q.set('api-version', API_VER);

  const targetProject = (projectName || project || '').trim();
  const projectScopedUrl = joinUrl(baseUrl, encodeURIComponent(targetProject), '_apis/git/repositories') + `?${q.toString()}`;
  const collectionScopedUrl = joinUrl(baseUrl, '_apis/git/repositories') + `?${q.toString()}`;

  if (!targetProject) {
    const data = await httpJson<{ value?: AzureGitRepository[] }>(collectionScopedUrl);
    return data.value ?? [];
  }

  const data = await httpJsonTfvcWithFallback<{ value?: AzureGitRepository[] }>(projectScopedUrl, collectionScopedUrl);
  return data.value ?? [];
}

export async function listTfvcItems(options?: {
  path?: string;
  recursionLevel?: 'None' | 'OneLevel' | 'Full';
}): Promise<TfvcItemEntry[]> {
  const { baseUrl, project } = ensureConfig();
  const tfvcPath = (options?.path || '').trim() || `$/` + project;
  const recursionLevel = options?.recursionLevel || 'OneLevel';
  const q = new URLSearchParams();
  q.set('api-version', API_VER);
  if (recursionLevel === 'None') {
    q.set('path', tfvcPath);
    q.set('recursionLevel', 'None');
  } else {
    // Azure DevOps Server expects scopePath for collections when recursion > None.
    q.set('scopePath', tfvcPath);
    q.set('recursionLevel', recursionLevel);
  }

  const projectScopedUrl = joinUrl(baseUrl, encodeURIComponent(project), '_apis/tfvc/items') + `?${q.toString()}`;
  const collectionScopedUrl = joinUrl(baseUrl, '_apis/tfvc/items') + `?${q.toString()}`;
  const raw = await httpJsonTfvcWithFallback<any>(projectScopedUrl, collectionScopedUrl);

  const list = Array.isArray(raw?.value)
    ? raw.value
    : Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object'
        ? [raw]
        : [];

  const mapped: TfvcItemEntry[] = list
    .map((it: any) => {
      const path = String(it?.path || it?.serverItem || '').trim();
      if (!path) return null;
      const isFolder = Boolean(it?.isFolder);
      const v = String(it?.version || '').trim();
      const contentLength = Number.isFinite(Number(it?.contentMetadata?.contentLength))
        ? Number(it.contentMetadata.contentLength)
        : undefined;
      return {
        path,
        isFolder,
        changesetVersion: v || undefined,
        contentLength,
        url: String(it?.url || '').trim() || undefined,
      } as TfvcItemEntry;
    })
    .filter(Boolean) as TfvcItemEntry[];

  mapped.sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
  return mapped;
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
  const projectScopedUrl =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/tfvc/changesets', changesetId) +
    `?api-version=${encodeURIComponent(API_VER)}`;
  const collectionScopedUrl =
    joinUrl(baseUrl, '_apis/tfvc/changesets', changesetId) +
    `?api-version=${encodeURIComponent(API_VER)}`;
  return httpJsonTfvcWithFallback<TfvcChangeset>(projectScopedUrl, collectionScopedUrl);
}

export async function getChangesetChanges(changesetId: number): Promise<{ value?: TfvcChangesetChange[] }> {
  const { baseUrl, project } = ensureConfig();
  const projectScopedUrl =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/tfvc/changesets', changesetId, 'changes') +
    `?api-version=${encodeURIComponent(API_VER)}`;
  const collectionScopedUrl =
    joinUrl(baseUrl, '_apis/tfvc/changesets', changesetId, 'changes') +
    `?api-version=${encodeURIComponent(API_VER)}`;
  return httpJsonTfvcWithFallback<{ value?: TfvcChangesetChange[] }>(projectScopedUrl, collectionScopedUrl);
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
  const projectScopedUrl = joinUrl(baseUrl, encodeURIComponent(project), '_apis/tfvc/diffs') + `?${q.toString()}`;
  const collectionScopedUrl = joinUrl(baseUrl, '_apis/tfvc/diffs') + `?${q.toString()}`;
  const data = await httpJsonTfvcWithFallback<{ diffBlocks?: unknown[]; [k: string]: unknown }>(projectScopedUrl, collectionScopedUrl);
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
  /** Filter by work item type (e.g. Bug, Task). */
  type?: string;
  /** Filter by states (e.g. New, Committed, In Progress). */
  states?: string[];
  /** Optional: exclude items with date >= this (for pagination). YYYY-MM-DD. */
  toDateExclusive?: string;
}

function wiqlDateRangeQuery(options: ListWorkItemsByDateRangeOptions): string {
  const from = options.fromDate;
  const to = options.toDateExclusive
    ? options.toDateExclusive
    : options.toDate;
  const useExclusive = !!options.toDateExclusive;
  const assignedTo = (options.assignedTo || '').trim();
  const type = (options.type || '').trim();
  const states = options.states || [];
  const dateField = options.dateField === 'changed' ? 'System.ChangedDate' : 'System.CreatedDate';
  const where: string[] = [];
  where.push(`[${dateField}] >= '${from.replace(/'/g, "''")}'`);
  if (useExclusive) {
    where.push(`[${dateField}] < '${String(options.toDateExclusive).replace(/'/g, "''")}'`);
  } else {
    where.push(`[${dateField}] <= '${to.replace(/'/g, "''")}'`);
  }
  if (type) where.push(`[System.WorkItemType] = '${type.replace(/'/g, "''")}'`);
  if (states.length > 0) {
    const list = states.map((s) => `'${String(s).replace(/'/g, "''")}'`).join(', ');
    where.push(`[System.State] IN (${list})`);
  }
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

const BATCH_MAX_IDS = 200;

async function getWorkItemsBatch(ids: number[]): Promise<WorkItemBatchValue[]> {
  if (ids.length === 0) return [];
  const { baseUrl, project } = ensureConfig();
  const url =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/workitemsbatch') +
    `?api-version=${encodeURIComponent(API_VER)}`;
  const out: WorkItemBatchValue[] = [];
  for (let i = 0; i < ids.length; i += BATCH_MAX_IDS) {
    const chunk = ids.slice(i, i + BATCH_MAX_IDS);
    const data = await httpJson<{ value?: WorkItemBatchValue[] }>(url, {
      method: 'POST',
      body: JSON.stringify({ ids: chunk, $expand: 'relations' }),
    });
    const v = data.value ?? [];
    out.push(...v);
  }
  return out;
}

const WIQL_PAGE_SIZE = 200;
const WIQL_MAX_PAGES = 50;

/** Run WIQL and follow x-ms-continuationtoken until we have enough ids or no more pages. */
async function wiqlCollectIds(
  baseUrl: string,
  body: { query: string },
  maxIds: number
): Promise<number[]> {
  const ids: number[] = [];
  let url = baseUrl;
  for (let page = 0; page < WIQL_MAX_PAGES && ids.length < maxIds; page++) {
    const r = await azureFetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
    if (!r.ok) {
      let errMsg = r.status + ' ' + r.statusText;
      try {
        const parsed = r.text ? JSON.parse(r.text) : null;
        if (parsed && typeof parsed === 'object') errMsg = JSON.stringify(parsed);
      } catch (_) {}
      throw new Error(`Azure DevOps WIQL failed: ${errMsg}`);
    }
    const data = (r.text ? JSON.parse(r.text) : null) as { workItems?: { id: number }[] } | null;
    const workItems = (data?.workItems || []).map((w) => w.id);
    for (const id of workItems) {
      if (ids.length >= maxIds) break;
      ids.push(id);
    }
    const token =
      (r.headers && (r.headers['x-ms-continuationtoken'] ?? r.headers['X-Ms-ContinuationToken'])) as
        | string
        | undefined;
    if (!token || workItems.length === 0) break;
    url = `${baseUrl}&continuationToken=${encodeURIComponent(token)}`;
  }
  return ids;
}

/** Single page: run WIQL (with continuation token follow) and fetch batch. */
async function listWorkItemsByDateRangePage(
  options: ListWorkItemsByDateRangeOptions & { toDateExclusive?: string },
  requestedTop: number
): Promise<WorkItemBatchValue[]> {
  const { baseUrl, project } = ensureConfig();
  const baseWiqlUrl =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/wiql') +
    `?$top=${Math.min(WIQL_PAGE_SIZE, requestedTop)}&api-version=${encodeURIComponent(API_VER)}`;
  const wiql = wiqlDateRangeQuery(options);
  const ids = await wiqlCollectIds(baseWiqlUrl, { query: wiql }, requestedTop);
  if (ids.length === 0) return [];
  return getWorkItemsBatch(ids);
}

/** Pick the earliest date from a batch (for pagination: next page ends at day before this). */
function minDateInBatch(items: WorkItemBatchValue[], dateField: 'created' | 'changed'): string | null {
  const key = dateField === 'changed' ? 'System.ChangedDate' : 'System.CreatedDate';
  let min: string | null = null;
  for (const wi of items) {
    const d = wi.fields?.[key];
    if (typeof d === 'string') {
      const dateOnly = d.slice(0, 10);
      if (min == null || dateOnly < min) min = dateOnly;
    }
  }
  return min;
}

/** Subtract one day from YYYY-MM-DD. */
function dateMinusOneDay(dateYmd: string): string {
  const d = new Date(dateYmd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Fetch cap so we follow continuation and get the full date range (not just the first page). */
const DATE_RANGE_FETCH_CAP = 2000;

/** Single-call version: WIQL + continuation until cap. Returns all items in range (up to DATE_RANGE_FETCH_CAP). Caller can slice for pagination. */
export async function listWorkItemsByDateRange(options: ListWorkItemsByDateRangeOptions): Promise<WorkItemBatchValue[]> {
  const page = await listWorkItemsByDateRangePage(
    { ...options, toDateExclusive: undefined },
    DATE_RANGE_FETCH_CAP
  );
  return page;
}

/** Paginated version: multiple WIQL requests by date window until top items or no more. For MCP/n8n when server returns few per request. */
export async function listWorkItemsByDateRangePaginated(
  options: ListWorkItemsByDateRangeOptions
): Promise<WorkItemBatchValue[]> {
  const top = Math.min(Math.max(1, options.top ?? 50), 2000);
  const skip = Math.max(0, options.skip ?? 0);
  const dateField = options.dateField ?? 'changed';
  const all: WorkItemBatchValue[] = [];
  let toDate: string = options.toDate;
  const seenIds = new Set<number>();
  let iterations = 0;
  const maxIterations = 100;

  while (all.length < top + skip && iterations < maxIterations) {
    iterations += 1;
    const page = await listWorkItemsByDateRangePage(
      { ...options, toDate, toDateExclusive: undefined },
      WIQL_PAGE_SIZE
    );
    let added = 0;
    for (const wi of page) {
      if (seenIds.has(wi.id)) continue;
      seenIds.add(wi.id);
      all.push(wi);
      added += 1;
    }
    if (page.length === 0) break;
    if (added === 0) break;
    const minD = minDateInBatch(page, dateField);
    if (!minD || minD <= options.fromDate) break;
    const nextTo = dateMinusOneDay(minD);
    if (nextTo < options.fromDate) break;
    toDate = nextTo;
  }

  return all.slice(skip, skip + top);
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
