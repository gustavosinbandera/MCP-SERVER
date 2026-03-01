export type ToolArgHelp = {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  enum?: string[];
};

export type ToolExample = {
  title: string;
  /** Arguments object passed to the tool. */
  args: Record<string, unknown>;
};

export type ToolCatalogEntry = {
  name: string;
  description: string;
  args?: ToolArgHelp[];
  examples?: ToolExample[];
  notes?: string[];
};

/**
 * Human-oriented catalog for MCP tools.
 * This is used both by:
 * - MCP tool `list_tools` (markdown list)
 * - Webapp help page via gateway REST endpoints
 */
export const MCP_TOOLS_CATALOG: ToolCatalogEntry[] = [
  {
    name: 'search_docs',
    description:
      'Search indexed Knowledge Hub documentation (Qdrant). Optional filters: project, branch, source_type, domain, class_name, referenced_type, file_name.',
    args: [
      { name: 'query', type: 'string', required: true, description: 'Query text (semantic).' },
      { name: 'limit', type: 'number', required: false, description: 'Max results (1–100).' },
      { name: 'project', type: 'string', required: false },
      { name: 'branch', type: 'string', required: false },
      { name: 'source_type', type: 'string', required: false, description: 'E.g. code | doc | url.' },
      { name: 'domain', type: 'string', required: false },
      { name: 'class_name', type: 'string', required: false },
      { name: 'referenced_type', type: 'string', required: false },
      { name: 'file_name', type: 'string', required: false },
    ],
    examples: [
      { title: 'Simple search', args: { query: 'file explorer', limit: 10 } },
      { title: 'Filter by project', args: { query: 'nginx upstream', project: 'mcp-server', limit: 8 } },
    ],
  },
  { name: 'count_docs', description: 'Return how many documents are indexed in the Qdrant collection (mcp_docs).' },
  {
    name: 'analize_code',
    description:
      'Code analysis with DB context: searches Qdrant for relevant docs and returns excerpts for analysis.',
    args: [
      { name: 'description', type: 'string', required: true, description: 'Bug/feature description to investigate.' },
      { name: 'component', type: 'string', required: false },
      { name: 'limit', type: 'number', required: false, description: 'Relevant results (1–30).' },
      { name: 'project', type: 'string', required: false },
      { name: 'branch', type: 'string', required: false },
      { name: 'source_type', type: 'string', required: false },
      { name: 'domain', type: 'string', required: false },
      { name: 'class_name', type: 'string', required: false },
      { name: 'referenced_type', type: 'string', required: false },
      { name: 'file_name', type: 'string', required: false },
    ],
    examples: [
      { title: 'Bug + component', args: { description: '502 Bad Gateway in nginx', component: 'nginx', limit: 15 } },
    ],
  },
  {
    name: 'index_url',
    description: 'Index the content of a URL in Qdrant. Optional: project, render_js (SPA).',
    args: [
      { name: 'url', type: 'string', required: true },
      { name: 'render_js', type: 'boolean', required: false },
      { name: 'project', type: 'string', required: false },
    ],
    examples: [{ title: 'Index a URL', args: { url: 'https://example.com/docs', render_js: false } }],
  },
  {
    name: 'index_url_with_links',
    description: 'Index a URL and up to max_links linked pages from the same domain.',
    args: [
      { name: 'url', type: 'string', required: true },
      { name: 'max_links', type: 'number', required: false },
      { name: 'render_js', type: 'boolean', required: false },
    ],
  },
  {
    name: 'index_site',
    description:
      'Index an entire site from a seed URL (BFS). max_pages, render_js, skip_already_indexed.',
    args: [
      { name: 'url', type: 'string', required: true },
      { name: 'max_pages', type: 'number', required: false },
      { name: 'render_js', type: 'boolean', required: false },
      { name: 'skip_already_indexed', type: 'boolean', required: false },
    ],
  },
  {
    name: 'write_flow_doc',
    description:
      'Create a Markdown document (a flow-map node) in INDEX_INBOX_DIR. Params: title, description; optional: files, functions, flow_summary, bug_id, project.',
    args: [
      { name: 'title', type: 'string', required: true },
      { name: 'description', type: 'string', required: true },
      { name: 'files', type: 'string', required: false },
      { name: 'functions', type: 'string', required: false },
      { name: 'flow_summary', type: 'string', required: false },
      { name: 'bug_id', type: 'string', required: false },
      { name: 'project', type: 'string', required: false },
    ],
    examples: [
      {
        title: 'Create a flow node',
        args: { title: 'Flow: file download', description: 'Summary of the /files/download endpoint', project: 'mcp-server' },
      },
    ],
  },
  {
    name: 'documentar_sesion',
    description:
      'Save a Markdown experience/session document in the user personal KB. Params: title, content; optional: bugOrFeatureId, tags.',
    args: [
      { name: 'title', type: 'string', required: true },
      { name: 'content', type: 'string', required: true },
      { name: 'bugOrFeatureId', type: 'string', required: false },
      { name: 'tags', type: 'string[]', required: false },
    ],
  },
  {
    name: 'list_shared_dir',
    description: 'List directories and files in the shared directory (SHARED_DIRS). Optional relative_path.',
    args: [{ name: 'relative_path', type: 'string', required: false }],
    examples: [{ title: 'Shared root', args: { relative_path: '' } }],
  },
  {
    name: 'read_shared_file',
    description: 'Read the contents of a file in the shared directory. relative_path required.',
    args: [{ name: 'relative_path', type: 'string', required: true }],
    examples: [{ title: 'Read a file', args: { relative_path: 'readme.txt' } }],
  },
  { name: 'list_url_links', description: 'List sub-links and files from a URL (counts and lists in Markdown).' },
  { name: 'view_url', description: 'Show the content of a URL in Markdown format. Optional: render_js (SPA).' },
  { name: 'mediawiki_login', description: 'Log into a MediaWiki site. For protected pages with view_url, index_url, list_url_links.' },
  {
    name: 'search_github_repos',
    description: 'Search GitHub by topic. Params: topic; optional: limit, sort (updated|stars|forks).',
    args: [
      { name: 'topic', type: 'string', required: true },
      { name: 'limit', type: 'number', required: false },
      { name: 'sort', type: 'string', required: false, enum: ['updated', 'stars', 'forks'] },
    ],
  },
  {
    name: 'repo_git',
    description:
      'Operate on the workspace Git repo: status, add, commit (message), push, pull. Optional: directory, paths.',
    args: [
      { name: 'action', type: 'string', required: true, enum: ['status', 'add', 'commit', 'push', 'pull'] },
      { name: 'message', type: 'string', required: false },
      { name: 'directory', type: 'string', required: false },
      { name: 'paths', type: 'string', required: false, description: 'E.g. "gateway/src/index.ts webapp/src/app/page.tsx"' },
    ],
    examples: [{ title: 'Show status', args: { action: 'status' } }],
    notes: ['This tool can modify the repo (commit/push). Use with care.'],
  },
  { name: 'repo_pull', description: 'Run git pull in the workspace repo. Optional: directory.' },
  { name: 'instance_update', description: 'Return the SSH command to update the instance (pull, build, up, restart, health).' },
  { name: 'instance_report', description: 'Return the SSH command to view instance status (containers, health).' },
  { name: 'instance_reboot', description: 'Return the SSH command to restart all instance services.' },
  { name: 'clickup_list_workspaces', description: 'List ClickUp workspaces (teams). Requires CLICKUP_API_TOKEN.' },
  { name: 'clickup_list_spaces', description: 'List spaces in a workspace. team_id.' },
  { name: 'clickup_list_folders', description: 'List folders in a space. space_id.' },
  { name: 'clickup_list_lists', description: 'List lists in a folder. folder_id.' },
  { name: 'clickup_list_tasks', description: 'List tasks in a list. list_id; optional: status, archived.' },
  { name: 'clickup_create_task', description: 'Create a task in a list. list_id, name; optional: description, status, priority.' },
  { name: 'clickup_create_subtask', description: 'Create a subtask under a task. list_id, parent_task_id, name; optional.' },
  { name: 'clickup_get_task', description: 'Get task details. task_id.' },
  { name: 'clickup_update_task', description: 'Update a task. task_id; optional: name, description, status, priority.' },
  { name: 'azure', description: 'Azure DevOps alias: accion "listar tareas", optional usuario. Without usuario = tasks assigned to you.' },
  {
    name: 'azure_list_work_items',
    description:
      'List Azure DevOps work items. Optional assigned_to; if not set, assigned to you. Optional: type, states, year, top.',
    args: [
      { name: 'type', type: 'string', required: false, description: 'E.g. Bug | Task' },
      { name: 'states', type: 'string', required: false, description: 'CSV: "New,Committed,In Progress"' },
      { name: 'year', type: 'number', required: false },
      { name: 'top', type: 'number', required: false },
      { name: 'assigned_to', type: 'string', required: false },
    ],
    examples: [{ title: 'Top 10 assigned to me', args: { top: 10 } }],
  },
  { name: 'azure_get_work_item', description: 'Get work item details. work_item_id.' },
  { name: 'azure_get_work_item_updates', description: 'Work item update history (logs). work_item_id; optional top.' },
  {
    name: 'azure_add_work_item_comment',
    description: 'Add a (Markdown) comment to a work item (Discussion / System.History). work_item_id, comment_text.',
    args: [
      { name: 'work_item_id', type: 'number', required: true },
      { name: 'comment_text', type: 'string', required: true },
    ],
    examples: [
      { title: 'Comment on a bug', args: { work_item_id: 123456, comment_text: 'Summary of diagnosis...\n\n- Step 1\n- Step 2' } },
    ],
  },
  { name: 'azure_bug_analysis_or_solution', description: 'Generate analysis/solution (English) for a bug and post it to the work item. Requires OPENAI_API_KEY.' },
  { name: 'azure_get_bug_changesets', description: 'List TFVC changesets linked to a bug. bug_id.' },
  { name: 'azure_get_changeset', description: 'Get a TFVC changeset: author, date, files. changeset_id.' },
  { name: 'azure_get_changeset_diff', description: 'Show the diff of a file in a changeset. changeset_id; optional file_index.' },
  { name: 'azure_count_changesets', description: 'Count TFVC changesets with filters. project, author, from_date, to_date, max_count.' },
  { name: 'azure_list_changesets', description: 'List TFVC changesets with filters. project, author, from_date, to_date, top (paginates internally).' },
  { name: 'azure_list_changeset_authors', description: 'List authors with changesets. Optional project; optional max_scan.' },
  { name: 'list_tools', description: 'List all available MCP tools with name and description.' },
];

export function getMcpToolsCatalog(): ToolCatalogEntry[] {
  return [...MCP_TOOLS_CATALOG].sort((a, b) => a.name.localeCompare(b.name));
}

export function getMcpToolByName(name: string): ToolCatalogEntry | undefined {
  const n = String(name || '').trim();
  if (!n) return undefined;
  return MCP_TOOLS_CATALOG.find((t) => t.name === n);
}

