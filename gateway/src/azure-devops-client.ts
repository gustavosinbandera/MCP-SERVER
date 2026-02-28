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
  const patch: JsonPatchOp[] = [];
  for (const [name, value] of Object.entries(fields)) {
    if (name && value !== undefined) {
      patch.push({ op: 'add', path: `/fields/${name}`, value });
    }
  }
  if (patch.length === 0) throw new Error('No fields to update');
  return updateWorkItem(id, patch);
}

/**
 * Adds a comment to the work item Discussion (System.History).
 * In our Azure DevOps (Server) instance, Discussion does NOT render raw Markdown—neither when
 * sent via API nor when pasted directly. Format only appears when pasting content copied from
 * a Markdown preview (i.e. HTML/rich). So we always convert Markdown → HTML and send HTML,
 * so it behaves like "copy from preview".
 */
export async function addWorkItemCommentAsMarkdown(
  id: number,
  markdownText: string
): Promise<{ id: number; rev?: number; fields?: Record<string, unknown> }> {
  const text = String(markdownText || '').trim();
  if (!text) throw new Error('Comment text is required');
  const html = commentMarkdownToHtmlForHistory(text);
  return updateWorkItem(id, [{ op: 'add', path: '/fields/System.History', value: html }]);
}

/**
 * Converts Markdown to plain text for servers that don't render Markdown/HTML in Discussion.
 * Removes ## ** *** etc. but keeps line breaks and structure so the comment is readable.
 */
export function markdownToPlainText(markdown: string): string {
  let s = String(markdown || '').trim();
  if (!s) return s;
  // Headings: ## Title -> Title + newline
  s = s.replace(/^#{1,6}\s+/gm, '');
  // Bold/italic: ***x*** or **x** or *x* -> x
  s = s.replace(/\*{2,3}([^*]+)\*{2,3}/g, '$1');
  s = s.replace(/\*{1}([^*]+)\*{1}/g, '$1');
  s = s.replace(/_{2,3}([^_]+)_{2,3}/g, '$1');
  s = s.replace(/_{1}([^_]+)_{1}/g, '$1');
  // Code blocks: ```lang\ncode``` -> code (keep newlines inside)
  s = s.replace(/```\w*\n?([\s\S]*?)```/g, (_, code) => code.trimEnd() + '\n\n');
  // Inline code: `x` -> x
  s = s.replace(/`([^`]+)`/g, '$1');
  return s.trim();
}

/**
 * Converts Markdown to HTML for Discussion (fallback when multilineFieldsFormat is not supported).
 * Produces semantic HTML (h2, h3, strong, ul/li, pre/code, p) so the UI can render it like pasted content.
 */
export function commentMarkdownToHtmlForHistory(markdown: string): string {
  const s = String(markdown || '').trim();
  if (!s) return s;
  const lines = s.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  const flushParagraph = (chunk: string) => {
    const t = chunk.trim();
    if (!t) return;
    out.push('<p>' + inlineMarkdownToHtml(t) + '</p>');
  };
  let para = '';
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^#{1,6}\s/.test(trimmed)) {
      if (para) {
        flushParagraph(para);
        para = '';
      }
      const level = trimmed.match(/^(#{1,6})\s/)?.[1].length ?? 2;
      const title = inlineMarkdownToHtml(trimmed.replace(/^#{1,6}\s+/, ''));
      out.push(level <= 2 ? `<h2>${title}</h2>` : `<h3>${title}</h3>`);
      i++;
      continue;
    }
    if (/^```\w*\s*$/.test(trimmed) || trimmed.startsWith('```')) {
      if (para) {
        flushParagraph(para);
        para = '';
      }
      const lang = trimmed.slice(3).trim();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const raw = codeLines.join('\n');
      out.push('<pre><code>' + escapeHtml(raw) + '</code></pre>');
      continue;
    }
    // List: allow optional leading whitespace (e.g. "  - item")
    const listMatch = trimmed.match(/^([-*]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      if (para) {
        flushParagraph(para);
        para = '';
      }
      out.push('<ul>');
      while (i < lines.length) {
        const m = lines[i].trim().match(/^([-*]|\d+\.)\s+(.*)$/);
        if (!m) break;
        out.push('<li>' + inlineMarkdownToHtml(m[2]) + '</li>');
        i++;
      }
      out.push('</ul>');
      continue;
    }
    if (trimmed === '') {
      if (para) {
        flushParagraph(para);
        para = '';
      }
      i++;
      continue;
    }
    para = para ? para + '\n' + line : line;
    i++;
  }
  if (para) flushParagraph(para);
  return out.join('\n');
}

/** Inline Markdown: `code` then **bold** then *italic*. No newlines. */
function inlineMarkdownToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  /** Excluye estados (p. ej. QA). Se aplica como NOT IN en WIQL. */
  statesExclude?: string[];
  /**
   * Filtra por área (System.AreaPath). Útil para limitar al departamento/equipo.
   * Ej.: "Magaya Core Project\\Blue Ivory Team"
   */
  areaPath?: string;
  /** Si true (default), usa operador UNDER; si false usa '=' (match exacto). */
  areaPathUnder?: boolean;
  /** Cuántos items saltar del resultado WIQL (paginación simple). */
  skip?: number;
  year?: number;
  dateField?: string;
  top?: number;
  /** Si true, filtra por [System.AssignedTo] = @Me (usuario del PAT). */
  assignedToMe?: boolean;
  /** Si se indica, filtra por ese usuario (nombre para mostrar o identificador). Anula assignedToMe. */
  assignedTo?: string;
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
    statesExclude = [],
    areaPath = '',
    areaPathUnder = true,
    skip = 0,
    year = 0,
    dateField = 'System.ChangedDate',
    top = 50,
    assignedToMe = true,
    assignedTo,
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

  const statesExcludeFilter =
    statesExclude.length > 0
      ? ` And [System.State] NOT IN (${statesExclude.map((s) => `'${escapeWiql(s)}'`).join(', ')}) `
      : '';

  const areaFilter = areaPath && areaPath.trim()
    ? ` And [System.AreaPath] ${areaPathUnder ? 'UNDER' : '='} '${escapeWiql(areaPath.trim())}' `
    : '';

  let assignedClause = '';
  if (assignedTo != null && assignedTo.trim() !== '') {
    assignedClause = ` And [System.AssignedTo] = '${escapeWiql(assignedTo.trim())}' `;
  } else if (assignedToMe) {
    assignedClause = ' And [System.AssignedTo] = @Me ';
  }

  const query =
    'Select [System.Id], [System.Title], [System.State] From WorkItems ' +
    `Where [System.TeamProject] = '${escapeWiql(project)}' ` +
    assignedClause +
    typeFilter +
    statesFilter +
    statesExcludeFilter +
    areaFilter +
    yearFilter +
    ' Order By [System.ChangedDate] desc';

  const wiqlUrl =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/wiql') +
    `?api-version=${encodeURIComponent(API_VER)}`;

  const wiql = await httpJson<WiqlResponse>(wiqlUrl, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });

  const start = Math.max(0, Math.floor(Number(skip) || 0));
  const end = start + Math.max(0, Math.floor(Number(top) || 0));
  const ids = (wiql.workItems || []).slice(start, end).map((w) => w.id);
  if (ids.length === 0) return [];

  const fieldsParam = 'System.Id,System.Title,System.State,System.WorkItemType,System.ChangedDate,System.AssignedTo,System.AreaPath';
  const batchUrl =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/workitems') +
    `?ids=${ids.join(',')}&fields=${encodeURIComponent(fieldsParam)}&api-version=${encodeURIComponent(API_VER)}`;

  const batch = await httpJson<{ value?: WorkItemBatchValue[] }>(batchUrl);
  return batch.value || [];
}

export interface ListWorkItemsByDateRangeOptions {
  /** Date string (inclusive). Prefer YYYY-MM-DD for Azure DevOps Server WIQL. */
  fromDate: string;
  /** Date string (inclusive). Prefer YYYY-MM-DD for Azure DevOps Server WIQL. */
  toDate: string;
  /** Optional: filter by assigned user display name/email (WIQL CONTAINS). */
  assignedTo?: string;
  /** Optional: filter assigned to @Me. Ignored if assignedTo is provided. */
  assignedToMe?: boolean;
  /** Optional: WorkItemType filter (e.g. Bug, Task). */
  type?: string;
  /** Optional: include only these states. */
  states?: string[];
  /** Optional: exclude these states. */
  statesExclude?: string[];
  /** Optional: area path filter. */
  areaPath?: string;
  /** If true, areaPath uses UNDER; else '='. */
  areaPathUnder?: boolean;
  /** Which field to use for date range. Default: created. */
  dateField?: 'created' | 'changed';
  /** Max results to return (default 50, max 200). */
  top?: number;
  /** Skip N results (pagination). */
  skip?: number;
}

/** Lista work items por rango de fechas (CreatedDate o ChangedDate) con filtros opcionales. */
export async function listWorkItemsByDateRange(options: ListWorkItemsByDateRangeOptions): Promise<WorkItemBatchValue[]> {
  const { baseUrl, project } = ensureConfig();
  const {
    fromDate,
    toDate,
    assignedTo,
    assignedToMe,
    type,
    states,
    statesExclude,
    areaPath,
    areaPathUnder = true,
    dateField = 'created',
    top = 50,
    skip = 0,
  } = options || ({} as ListWorkItemsByDateRangeOptions);

  if (!fromDate?.trim() || !toDate?.trim()) throw new Error('fromDate y toDate son requeridos.');

  const dateWiqlField = dateField === 'changed' ? 'System.ChangedDate' : 'System.CreatedDate';
  const typeFilter = type ? ` And [System.WorkItemType] = '${escapeWiql(type)}' ` : '';
  const statesFilter =
    Array.isArray(states) && states.length > 0
      ? ` And [System.State] IN (${states.map((s) => `'${escapeWiql(String(s))}'`).join(', ')}) `
      : '';
  const statesExcludeFilter =
    Array.isArray(statesExclude) && statesExclude.length > 0
      ? ` And [System.State] NOT IN (${statesExclude.map((s) => `'${escapeWiql(String(s))}'`).join(', ')}) `
      : '';
  const areaFilter = areaPath?.trim()
    ? ` And [System.AreaPath] ${areaPathUnder ? 'UNDER' : '='} '${escapeWiql(areaPath.trim())}' `
    : '';

  let assignedClause = '';
  if (assignedTo != null && assignedTo.trim() !== '') {
    // CONTAINS permite filtrar por nombre parcial (displayName) o email.
    assignedClause = ` And [System.AssignedTo] CONTAINS '${escapeWiql(assignedTo.trim())}' `;
  } else if (assignedToMe) {
    assignedClause = ' And [System.AssignedTo] = @Me ';
  }

  const query =
    'Select [System.Id], [System.Title], [System.State] From WorkItems ' +
    `Where [System.TeamProject] = '${escapeWiql(project)}' ` +
    ` And [${dateWiqlField}] >= '${escapeWiql(fromDate.trim())}' ` +
    ` And [${dateWiqlField}] <= '${escapeWiql(toDate.trim())}' ` +
    assignedClause +
    typeFilter +
    statesFilter +
    statesExcludeFilter +
    areaFilter +
    ` Order By [${dateWiqlField}] desc`;

  const wiqlUrl =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/wiql') +
    `?api-version=${encodeURIComponent(API_VER)}`;

  const wiql = await httpJson<WiqlResponse>(wiqlUrl, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });

  const start = Math.max(0, Math.floor(Number(skip) || 0));
  const maxTop = Math.max(1, Math.min(200, Math.floor(Number(top) || 50)));
  const end = start + maxTop;
  const ids = (wiql.workItems || []).slice(start, end).map((w) => w.id);
  if (ids.length === 0) return [];

  const fieldsParam = [
    'System.Id',
    'System.Title',
    'System.State',
    'System.WorkItemType',
    'System.CreatedDate',
    'System.ChangedDate',
    'System.AssignedTo',
    'System.CreatedBy',
    'System.AreaPath',
  ].join(',');

  const batchUrl =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/workitems') +
    `?ids=${ids.join(',')}&fields=${encodeURIComponent(fieldsParam)}&api-version=${encodeURIComponent(API_VER)}`;

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

/** Work item update (revision): quién, cuándo, qué campos cambiaron. */
export interface WorkItemUpdate {
  id?: number;
  rev?: number;
  revisedBy?: { id?: string; displayName?: string; uniqueName?: string };
  revisedDate?: string;
  fields?: Record<string, { oldValue?: unknown; newValue?: unknown }>;
}

export async function getWorkItemUpdates(id: number, top = 50): Promise<{ value?: WorkItemUpdate[] }> {
  const { baseUrl, project } = ensureConfig();
  const url =
    joinUrl(baseUrl, encodeURIComponent(project), '_apis/wit/workitems', id, 'updates') +
    `?$top=${Math.max(1, Math.min(100, top))}&api-version=${encodeURIComponent(API_VER)}`;
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

/** Rutas TFVC por proyecto (se pueden sobreescribir con env). */
const DEFAULT_PATH_BLUEIVORY = '$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-MAIN';
const DEFAULT_PATH_CORE = '$/Magaya Core Project/Projects/MAIN-BRANCHES/CORE';

function getItemPathForProject(project: string): string | undefined {
  const p = (project || '').trim().toLowerCase();
  if (!p) return undefined;
  if (p === 'blueivory' || p === 'bi' || p === 'blue ivory') {
    return (process.env.AZURE_DEVOPS_TFVC_PATH_BLUEIVORY || '').trim() || DEFAULT_PATH_BLUEIVORY;
  }
  if (p === 'core' || p === 'classic') {
    return (process.env.AZURE_DEVOPS_TFVC_PATH_CORE || '').trim() || DEFAULT_PATH_CORE;
  }
  return undefined;
}

/** Opciones para listar changesets (TFVC). */
export interface ListChangesetsOptions {
  /** Autor: alias o display name de quien hizo el changeset. */
  author?: string;
  /** Solo changesets creados después de esta fecha (ISO string). */
  fromDate?: string;
  /** Solo changesets creados antes de esta fecha (ISO string). */
  toDate?: string;
  /** Filtro por proyecto: "blueivory" o "core" (classic). Usa searchCriteria.itemPath. */
  project?: string;
  /** Ruta TFVC bajo la que filtrar (anula project si se indica). */
  itemPath?: string;
  /** Máximo de resultados (default 100). */
  top?: number;
  /** Cuántos resultados saltar (paginación). */
  skip?: number;
}

export interface TfvcChangesetRef {
  changesetId?: number;
  comment?: string;
  createdDate?: string;
  checkedInBy?: { displayName?: string; uniqueName?: string };
  author?: { displayName?: string; uniqueName?: string };
  [k: string]: unknown;
}

/** Lista changesets TFVC con filtros opcionales (autor, rango de fechas, proyecto). */
export async function listChangesets(options: ListChangesetsOptions = {}): Promise<TfvcChangesetRef[]> {
  const { baseUrl } = ensureConfig();
  const { author, fromDate, toDate, project, itemPath, top = 100, skip = 0 } = options;
  const pathFilter = (itemPath && itemPath.trim()) || (project ? getItemPathForProject(project) : undefined);
  const params = new URLSearchParams();
  params.set('api-version', API_VER);
  if (top > 0) params.set('$top', String(Math.min(top, 1000)));
  if (skip > 0) params.set('$skip', String(skip));
  if (author?.trim()) params.set('searchCriteria.author', author.trim());
  if (fromDate?.trim()) params.set('searchCriteria.fromDate', fromDate.trim());
  if (toDate?.trim()) params.set('searchCriteria.toDate', toDate.trim());
  if (pathFilter) params.set('searchCriteria.itemPath', pathFilter);
  const url = joinUrl(baseUrl, '_apis/tfvc/changesets') + '?' + params.toString();
  const data = await httpJson<{ value?: TfvcChangesetRef[] }>(url);
  return data.value || [];
}

/** Descubre autores únicos que tienen changesets (leyendo hasta maxChangesets). Opcional project: "blueivory" | "core". */
export async function listChangesetAuthors(
  maxChangesetsToScan: number = 2000,
  project?: string
): Promise<string[]> {
  const seen = new Set<string>();
  let skip = 0;
  const pageSize = 200;
  while (skip < maxChangesetsToScan) {
    const page = await listChangesets({ top: pageSize, skip, project });
    if (page.length === 0) break;
    for (const cs of page) {
      const who = pickAuthor(cs);
      if (who) seen.add(who);
    }
    if (page.length < pageSize) break;
    skip += pageSize;
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b, 'es'));
}

/** Cuenta changesets con los mismos filtros que listChangesets. Pagina hasta terminar o hasta maxCount. */
export async function getChangesetCount(options: {
  author?: string;
  fromDate?: string;
  toDate?: string;
  /** Filtro por proyecto: "blueivory" o "core" (classic). */
  project?: string;
  itemPath?: string;
  /** Límite máximo a contar (evita tiempo excesivo en repos muy grandes). Default 100_000. */
  maxCount?: number;
} = {}): Promise<{ count: number; truncated: boolean }> {
  const { author, fromDate, toDate, project, itemPath, maxCount = 100_000 } = options;
  const pathFilter = (itemPath && itemPath.trim()) || (project ? getItemPathForProject(project) : undefined);
  const pageSize = 1000;
  let total = 0;
  let skip = 0;
  let truncated = false;
  while (true) {
    const page = await listChangesets({
      author,
      fromDate,
      toDate,
      itemPath: pathFilter,
      top: pageSize,
      skip,
    });
    total += page.length;
    if (page.length < pageSize) break;
    if (total >= maxCount) {
      truncated = true;
      break;
    }
    skip += pageSize;
  }
  return { count: total, truncated };
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
