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
      'AZURE_DEVOPS_BASE_URL, AZURE_DEVOPS_PROJECT y AZURE_DEVOPS_PAT deben estar definidos en .env.'
    );
  }
  return c;
}

async function httpJson<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const { pat } = ensureConfig();
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader(pat),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });
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

async function httpText(url: string): Promise<string> {
  const { pat } = ensureConfig();
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(pat),
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Azure DevOps HTTP ${res.status} ${res.statusText}\nURL: ${url}\n${text}`);
  }
  return text;
}

function escapeWiql(str: string): string {
  return String(str).replace(/'/g, "''");
}

// --- Work Items ---

export interface ListWorkItemsOptions {
  type?: string;
  states?: string[];
  year?: number;
  dateField?: string;
  top?: number;
  assignedToMe?: boolean;
}

interface WiqlResponse {
  workItems?: { id: number }[];
}

interface WorkItemBatchValue {
  id: number;
  fields?: Record<string, unknown>;
}

export async function listWorkItems(options: ListWorkItemsOptions = {}): Promise<WorkItemBatchValue[]> {
  const { baseUrl, project } = ensureConfig();
  const {
    type = '',
    states = [],
    year = 0,
    dateField = 'System.ChangedDate',
    top = 50,
    assignedToMe = true,
  } = options;

  const typeFilter = type ? ` And [System.WorkItemType] = '${escapeWiql(type)}' ` : '';
  let yearFilter = '';
  if (year && Number.isFinite(year)) {
    const start = `${year}-01-01T00:00:00Z`;
    const end = `${year + 1}-01-01T00:00:00Z`;
    yearFilter = ` And [${dateField}] >= '${start}' And [${dateField}] < '${end}' `;
  }
  const statesFilter =
    states.length > 0
      ? ` And [System.State] IN (${states.map((s) => `'${escapeWiql(s)}'`).join(', ')}) `
      : '';

  const assignedClause = assignedToMe ? ' And [System.AssignedTo] = @Me ' : '';

  const query =
    'Select [System.Id], [System.Title], [System.State] From WorkItems ' +
    `Where [System.TeamProject] = '${escapeWiql(project)}' ` +
    assignedClause +
    typeFilter +
    statesFilter +
    yearFilter +
    ' Order By [System.ChangedDate] desc';

  const wiqlUrl =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/wiql') +
    `?api-version=${encodeURIComponent(API_VER)}`;

  const wiql = await httpJson<WiqlResponse>(wiqlUrl, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });

  const ids = (wiql.workItems || []).slice(0, top).map((w) => w.id);
  if (ids.length === 0) return [];

  const batchUrl =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/workitems') +
    `?ids=${ids.join(',')}&api-version=${encodeURIComponent(API_VER)}`;

  const batch = await httpJson<{ value?: WorkItemBatchValue[] }>(batchUrl);
  return batch.value || [];
}

export async function getWorkItem(id: number): Promise<{ id: number; fields?: Record<string, unknown>; [k: string]: unknown }> {
  const { baseUrl, project } = ensureConfig();
  const url =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/workitems', id) +
    `?api-version=${encodeURIComponent(API_VER)}`;
  return httpJson(url);
}

export async function getWorkItemWithRelations(id: number): Promise<{
  id: number;
  fields?: Record<string, unknown>;
  relations?: { rel?: string; url?: string }[];
  [k: string]: unknown;
}> {
  const { baseUrl, project } = ensureConfig();
  const url =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/workitems', id) +
    `?$expand=relations&api-version=${encodeURIComponent(API_VER)}`;
  return httpJson(url);
}

/** Extract TFVC changeset IDs from work item relations (ArtifactLink). */
export function extractChangesetIds(workItem: { relations?: { rel?: string; url?: string }[] }): number[] {
  const rels = workItem.relations || [];
  const ids = new Set<number>();
  for (const r of rels) {
    if (!r || r.rel !== 'ArtifactLink') continue;
    const url = String(r.url || '');
    const m = url.match(/VersionControl\/Changeset\/(\d+)/i);
    if (m && m[1]) ids.add(Number(m[1]));
  }
  return Array.from(ids).sort((a, b) => b - a);
}

// --- TFVC Changesets ---

export async function getChangeset(id: number): Promise<{
  changesetId?: number;
  comment?: string;
  createdDate?: string;
  checkinDate?: string;
  checkedInBy?: { displayName?: string; uniqueName?: string };
  author?: { displayName?: string; uniqueName?: string };
  [k: string]: unknown;
}> {
  const { baseUrl } = ensureConfig();
  const url = joinUrl(baseUrl, '_apis/tfvc/changesets', id) + `?api-version=${encodeURIComponent(API_VER)}`;
  return httpJson(url);
}

export async function getChangesetChanges(changesetId: number): Promise<
  { value?: { changeType?: string; item?: { path?: string; serverItem?: string } }[] }
> {
  const { baseUrl } = ensureConfig();
  const url =
    joinUrl(baseUrl, '_apis/tfvc/changesets', changesetId, 'changes') +
    `?api-version=${encodeURIComponent(API_VER)}`;
  return httpJson(url);
}

export function pickAuthor(cs: { checkedInBy?: { displayName?: string; uniqueName?: string }; author?: { displayName?: string; uniqueName?: string } }): string {
  const p = cs.checkedInBy || cs.author || null;
  return p ? (p.displayName || p.uniqueName || '').trim() : '';
}

/** Find previous changeset that modified the given file at or before targetCsId. */
export async function findPrevChangesetForFile(tfvcPath: string, targetCsId: number): Promise<{
  current?: number;
  prev?: number;
  raw: number[];
}> {
  const { baseUrl } = ensureConfig();
  const url =
    joinUrl(baseUrl, '_apis/tfvc/changesets') +
    `?searchCriteria.itemPath=${encodeURIComponent(tfvcPath)}` +
    `&searchCriteria.toId=${encodeURIComponent(String(targetCsId))}` +
    '&$top=5' +
    `&api-version=${encodeURIComponent(API_VER)}`;

  const data = await httpJson<{ value?: { changesetId?: number }[] }>(url);
  const list = (data.value || [])
    .map((cs) => cs.changesetId)
    .filter((id): id is number => Number.isFinite(id));
  const sorted = Array.from(new Set(list)).sort((a, b) => b - a);
  const current = sorted.find((id) => id <= targetCsId);
  const prev = sorted.find((id) => id < (current ?? 0));
  return { current, prev, raw: sorted };
}

export async function getFileContentAtChangeset(tfvcPath: string, changesetId: number): Promise<string> {
  const { baseUrl } = ensureConfig();
  const url =
    joinUrl(baseUrl, '_apis/tfvc/items') +
    `?path=${encodeURIComponent(tfvcPath)}` +
    `&versionType=Changeset&version=${encodeURIComponent(String(changesetId))}` +
    '&includeContent=true' +
    `&api-version=${encodeURIComponent(API_VER)}`;

  const data = await httpJson<{ content?: string }>(url);
  if (data && typeof data.content === 'string') return data.content;

  const textUrl =
    joinUrl(baseUrl, '_apis/tfvc/items') +
    `?path=${encodeURIComponent(tfvcPath)}` +
    `&versionType=Changeset&version=${encodeURIComponent(String(changesetId))}` +
    '&download=true' +
    `&api-version=${encodeURIComponent(API_VER)}`;
  return httpText(textUrl);
}

/** Simple line-based diff (LCS). Returns array of { t: ' '|'-'|'+', s: string }. */
function splitLines(s: string): string[] {
  return String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function lcsDiff(aLines: string[], bLines: string[]): { t: string; s: string }[] {
  const n = aLines.length;
  const m = bLines.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        aLines[i] === bLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: { t: string; s: string }[] = [];
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      out.push({ t: ' ', s: aLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ t: '-', s: aLines[i] });
      i++;
    } else {
      out.push({ t: '+', s: bLines[j] });
      j++;
    }
  }
  while (i < n) out.push({ t: '-', s: aLines[i++] });
  while (j < m) out.push({ t: '+', s: bLines[j++] });
  return out;
}

/** Get readable diff for one file between previous and target changeset. */
export async function getChangesetFileDiff(
  tfvcPath: string,
  targetChangesetId: number,
  maxLines: number = 500
): Promise<{ diff: { t: string; s: string }[]; prevCs?: number; currentCs?: number; isNewFile: boolean }> {
  const { prev, current } = await findPrevChangesetForFile(tfvcPath, targetChangesetId);
  if (!current) {
    throw new Error('No changeset found for file at target.');
  }
  if (!prev) {
    const content = await getFileContentAtChangeset(tfvcPath, current);
    const lines = splitLines(content);
    return {
      diff: lines.map((s) => ({ t: '+', s })),
      prevCs: undefined,
      currentCs: current,
      isNewFile: true,
    };
  }
  const baseContent = await getFileContentAtChangeset(tfvcPath, prev);
  const targetContent = await getFileContentAtChangeset(tfvcPath, current);
  const ops = lcsDiff(splitLines(baseContent), splitLines(targetContent));
  const changedIdx: number[] = [];
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].t === '+' || ops[k].t === '-') changedIdx.push(k);
  }
  const CONTEXT = 2;
  const keep = new Set<number>();
  for (const idx of changedIdx) {
    for (let k = Math.max(0, idx - CONTEXT); k <= Math.min(ops.length - 1, idx + CONTEXT); k++) {
      keep.add(k);
    }
  }
  const out: { t: string; s: string }[] = [];
  let last = -2;
  for (const k of Array.from(keep).sort((a, b) => a - b)) {
    if (k > last + 1) out.push({ t: '...', s: '' });
    out.push(ops[k]);
    last = k;
  }
  const limited = out.slice(0, maxLines);
  return { diff: limited, prevCs: prev, currentCs: current, isNewFile: false };
}
