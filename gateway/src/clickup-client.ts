/**
 * ClickUp API v2 client for MCP tools (list workspaces/spaces/folders/lists/tasks, create/update task).
 * Uses CLICKUP_API_TOKEN (Personal API Token, pk_...) in Authorization header.
 * See docs/CLICKUP-API-REFERENCE.md.
 */

const CLICKUP_BASE = 'https://api.clickup.com/api/v2';

function getToken(): string | undefined {
  const raw = process.env.CLICKUP_API_TOKEN?.trim();
  if (!raw) return undefined;
  return raw.replace(/\r/g, '').trim();
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  if (!token) {
    throw new Error('CLICKUP_API_TOKEN is not set. Add your Personal API Token in .env or gateway/.env (local and instance).');
  }
  return {
    Authorization: token,
    'Content-Type': 'application/json',
  };
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${CLICKUP_BASE}${path}`, { headers: authHeaders() });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ClickUp API ${res.status}: ${text || res.statusText}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${CLICKUP_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ClickUp API ${res.status}: ${text || res.statusText}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function apiPut<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${CLICKUP_BASE}${path}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ClickUp API ${res.status}: ${text || res.statusText}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// Response types (minimal; API returns more fields)
export interface ClickUpTeam {
  id: number;
  name?: string;
  [k: string]: unknown;
}

export interface ClickUpSpace {
  id: string;
  name?: string;
  [k: string]: unknown;
}

export interface ClickUpFolder {
  id: string;
  name?: string;
  lists?: ClickUpList[];
  [k: string]: unknown;
}

export interface ClickUpList {
  id: string;
  name?: string;
  [k: string]: unknown;
}

export interface ClickUpTask {
  id: string;
  name?: string;
  description?: string;
  status?: { status?: string; [k: string]: unknown };
  [k: string]: unknown;
}

export interface ClickUpUser {
  id?: number;
  username?: string;
  [k: string]: unknown;
}

export function hasClickUpToken(): boolean {
  return !!getToken();
}

/** Returns the authenticated user (Personal API Token owner). Use id for assignees. */
export async function getAuthorizedUser(): Promise<ClickUpUser> {
  const data = await apiGet<{ user?: ClickUpUser }>('/user');
  return data.user ?? (data as unknown as ClickUpUser);
}

export async function getTeams(): Promise<ClickUpTeam[]> {
  const data = (await apiGet<{ teams?: ClickUpTeam[] }>('/team'));
  return data.teams ?? [];
}

export async function getSpaces(teamId: string): Promise<ClickUpSpace[]> {
  const data = (await apiGet<{ spaces?: ClickUpSpace[] }>(`/team/${encodeURIComponent(teamId)}/space`));
  return data.spaces ?? [];
}

export async function getFolders(spaceId: string): Promise<ClickUpFolder[]> {
  const data = (await apiGet<{ folders?: ClickUpFolder[] }>(`/space/${encodeURIComponent(spaceId)}/folder`));
  return data.folders ?? [];
}

export async function getLists(folderId: string): Promise<ClickUpList[]> {
  const data = (await apiGet<{ lists?: ClickUpList[] }>(`/folder/${encodeURIComponent(folderId)}/list`));
  return data.lists ?? [];
}

/** List with optional statuses (for finding "in progress" etc.). */
export interface ClickUpListWithStatuses extends ClickUpList {
  statuses?: Array<{ status: string; orderindex?: number; [k: string]: unknown }>;
}

export async function getList(listId: string): Promise<ClickUpListWithStatuses> {
  return apiGet<ClickUpListWithStatuses>(`/list/${encodeURIComponent(listId)}`);
}

export interface GetTasksParams {
  archived?: boolean;
  /** One or more status names; API expects array (sent as statuses[]=...). */
  statuses?: string | string[];
}

export async function getTasks(listId: string, params?: GetTasksParams): Promise<ClickUpTask[]> {
  const q = new URLSearchParams();
  if (params?.archived != null) q.set('archived', String(params.archived));
  if (params?.statuses) {
    const arr = Array.isArray(params.statuses) ? params.statuses : [params.statuses];
    arr.forEach((s) => s && q.append('statuses[]', s));
  }
  const query = q.toString();
  const urlPath = `/list/${encodeURIComponent(listId)}/task${query ? `?${query}` : ''}`;
  const data = (await apiGet<{ tasks?: ClickUpTask[] }>(urlPath));
  return data.tasks ?? [];
}

export interface CreateTaskBody {
  name: string;
  description?: string;
  /** Markdown source; use so ClickUp renders formatting (headings, code blocks). */
  markdown_description?: string;
  status?: string;
  priority?: number;
  assignees?: number[];
  due_date?: number;
  /** Parent task ID; when set, creates a subtask. */
  parent?: string;
  [k: string]: unknown;
}

export async function createTask(listId: string, body: CreateTaskBody): Promise<ClickUpTask> {
  const data = (await apiPost<ClickUpTask>(`/list/${encodeURIComponent(listId)}/task`, body));
  return data;
}

/** Creates a subtask under a parent task. Same list as parent. Body: name (required), description, assignees, etc. */
export async function createSubtask(
  listId: string,
  parentTaskId: string,
  body: CreateTaskBody
): Promise<ClickUpTask> {
  return createTask(listId, { ...body, parent: parentTaskId });
}

export interface GetTaskParams {
  /** Include subtasks in the response (default false). */
  include_subtasks?: boolean;
}

export async function getTask(taskId: string, params?: GetTaskParams): Promise<ClickUpTask> {
  const q = new URLSearchParams();
  if (params?.include_subtasks) q.set('include_subtasks', 'true');
  const query = q.toString();
  const path = `/task/${encodeURIComponent(taskId)}${query ? `?${query}` : ''}`;
  return apiGet<ClickUpTask>(path);
}

export interface UpdateTaskBody {
  name?: string;
  description?: string;
  /** Markdown source for the description; use this so ClickUp renders headings, code blocks, etc. */
  markdown_description?: string;
  status?: string;
  priority?: number;
  /** Time estimate in milliseconds. */
  time_estimate?: number;
  [k: string]: unknown;
}

export async function updateTask(taskId: string, body: UpdateTaskBody): Promise<ClickUpTask> {
  return apiPut<ClickUpTask>(`/task/${encodeURIComponent(taskId)}`, body);
}

/** Add an existing workspace tag to a task. Tag must exist in the workspace. */
export async function addTagToTask(
  taskId: string,
  tagName: string,
  workspaceId: string
): Promise<unknown> {
  const encodedTask = encodeURIComponent(taskId);
  const encodedTag = encodeURIComponent(tagName);
  return apiPost<unknown>(`/task/${encodedTask}/tag/${encodedTag}`, {
    workspace_id: workspaceId,
  });
}

/** Create a time entry for a task. Duration and start in milliseconds (Unix). */
export interface CreateTimeEntryBody {
  task_id: string;
  duration: number;
  start: number;
  description?: string;
  billable?: boolean;
  [k: string]: unknown;
}

export async function createTimeEntry(
  teamId: string,
  body: CreateTimeEntryBody
): Promise<unknown> {
  return apiPost<unknown>(`/team/${encodeURIComponent(teamId)}/time_entries`, body);
}

/** Link this task to another (relationship). Source = taskId in URL, target = links_to in body. */
export async function addTaskLink(taskId: string, linksToTaskId: string): Promise<unknown> {
  return apiPost<unknown>(`/task/${encodeURIComponent(taskId)}/link`, {
    links_to: linksToTaskId,
  });
}
