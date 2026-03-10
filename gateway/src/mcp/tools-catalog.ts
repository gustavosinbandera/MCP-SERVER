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
      'List Azure DevOps work items. Returns v2 envelope: summary_text (human) + data.items[] (id, title, state, type, assigned_to, changed_date). Optional: from_date, to_date, assigned_to, type, states, top, date_field (created|changed).',
    args: [
      { name: 'type', type: 'string', required: false, description: 'E.g. Bug | Task' },
      { name: 'states', type: 'string', required: false, description: 'CSV: "New,Committed,In Progress"' },
      { name: 'year', type: 'number', required: false },
      { name: 'top', type: 'number', required: false },
      { name: 'assigned_to', type: 'string', required: false },
      { name: 'from_date', type: 'string', required: false, description: 'Start date YYYY-MM-DD (inclusive)' },
      { name: 'to_date', type: 'string', required: false, description: 'End date YYYY-MM-DD (inclusive); if omitted when from_date is set, today is used' },
      { name: 'date_field', type: 'string', required: false, enum: ['created', 'changed'], description: 'Filter by System.CreatedDate or System.ChangedDate (default: changed)' },
    ],
    examples: [
      { title: 'Top 10 assigned to me', args: { top: 10 } },
      { title: 'Bugs last month to today', args: { type: 'Bug', states: 'New,Committed,In Progress', assigned_to: 'Gustavo Grisales', from_date: '2026-02-07', top: 50 } },
    ],
  },
  {
    name: 'azure_list_work_items_by_date',
    description:
      'List work items by date range with pagination (for n8n). Returns v2 envelope: summary_text + data.items[]. from_date required (YYYY-MM-DD); to_date optional (default today). Optional: type, states, assigned_to, top (max 2000), date_field.',
    args: [
      { name: 'from_date', type: 'string', required: true, description: 'Start date YYYY-MM-DD (inclusive)' },
      { name: 'to_date', type: 'string', required: false, description: 'End date YYYY-MM-DD (inclusive); default today' },
      { name: 'type', type: 'string', required: false },
      { name: 'states', type: 'string', required: false, description: 'CSV: New,Committed,In Progress' },
      { name: 'assigned_to', type: 'string', required: false },
      { name: 'top', type: 'number', required: false },
      { name: 'date_field', type: 'string', required: false, enum: ['created', 'changed'] },
    ],
    examples: [{ title: 'Bugs for Gustavo last month to today', args: { from_date: '2026-02-07', type: 'Bug', states: 'New,Committed,In Progress', assigned_to: 'Gustavo Grisales', top: 100 } }],
  },
  {
    name: 'azure_find_related_work_items',
    description:
      'Find work items by regex match in title within a date range, with optional requirement to have linked changesets. Useful for topic searches (shipment, invoice, AWB).',
    args: [
      { name: 'from_date', type: 'string', required: true, description: 'Start date YYYY-MM-DD (inclusive)' },
      { name: 'to_date', type: 'string', required: false, description: 'End date YYYY-MM-DD (inclusive); default today' },
      { name: 'regex', type: 'string', required: true, description: 'Regex pattern to apply to System.Title' },
      { name: 'regex_flags', type: 'string', required: false, description: 'Regex flags (default i)' },
      { name: 'must_have_changesets', type: 'boolean', required: false, description: 'Default true; keep only work items with linked changesets' },
      { name: 'type', type: 'string', required: false },
      { name: 'states', type: 'string', required: false, description: 'CSV: New,Committed,In Progress' },
      { name: 'assigned_to', type: 'string', required: false },
      { name: 'date_field', type: 'string', required: false, enum: ['created', 'changed'] },
      { name: 'top', type: 'number', required: false, description: 'Max matches to return (default 50)' },
      { name: 'scan_top', type: 'number', required: false, description: 'How many work items to scan before regex filtering (default max(300, top*4))' },
    ],
    examples: [
      {
        title: 'Shipment bugs with changesets',
        args: {
          from_date: '2026-02-10',
          to_date: '2026-03-10',
          regex: '\\b(shipment|shipments|awb|cargo release)\\b',
          regex_flags: 'i',
          must_have_changesets: true,
          type: 'Bug',
          top: 50,
        },
      },
    ],
  },
  {
    name: 'azure_find_related_work_items_with_code_evidence',
    description:
      'Find work items by title regex and rank with code evidence using grep_code (mgrep) in blueivory/classic, cross-checked against changed files from linked changesets.',
    args: [
      { name: 'from_date', type: 'string', required: true, description: 'Start date YYYY-MM-DD (inclusive)' },
      { name: 'to_date', type: 'string', required: false, description: 'End date YYYY-MM-DD (inclusive); default today' },
      { name: 'regex', type: 'string', required: true, description: 'Regex for System.Title' },
      { name: 'regex_flags', type: 'string', required: false, description: 'Regex flags (default i)' },
      { name: 'must_have_changesets', type: 'boolean', required: false, description: 'Default true; keep only work items with linked changesets' },
      { name: 'type', type: 'string', required: false },
      { name: 'states', type: 'string', required: false },
      { name: 'assigned_to', type: 'string', required: false },
      { name: 'date_field', type: 'string', required: false, enum: ['created', 'changed'] },
      { name: 'top', type: 'number', required: false },
      { name: 'scan_top', type: 'number', required: false },
      { name: 'code_pattern', type: 'string', required: false, description: 'Regex used by grep_code (defaults to title regex)' },
      { name: 'code_path', type: 'string', required: false, enum: ['auto', 'blueivory', 'classic', 'both'] },
      { name: 'code_include', type: 'string', required: false, description: 'Optional rg glob include for grep_code' },
      { name: 'code_max_matches', type: 'number', required: false },
      { name: 'max_changesets_per_item', type: 'number', required: false },
    ],
    examples: [
      {
        title: 'Shipment bugs with code evidence',
        args: {
          from_date: '2026-02-10',
          to_date: '2026-03-10',
          regex: '\\b(shipment|shipments|awb|cargo release)\\b',
          regex_flags: 'i',
          must_have_changesets: true,
          type: 'Bug',
          code_pattern: '\\b(shipment|awb|cargo release|bill of lading)\\b',
          code_path: 'auto',
          top: 20,
        },
      },
    ],
  },
  {
    name: 'azure_get_work_item',
    description:
      'Get work item details. work_item_id. Optional mode: compact (default, structured data + description/expected/actual/repro as plain text), full (compact + raw fields), legacy (plain text only). Returns v2 envelope: summary_text, data, meta (elapsed_ms).',
    args: [
      { name: 'work_item_id', type: 'number', required: true },
      { name: 'mode', type: 'string', required: false, enum: ['compact', 'full', 'legacy'] },
    ],
  },
  {
    name: 'azure_get_work_item_updates',
    description:
      'Work item update history. work_item_id; optional top, summary_only, only_relevant_fields, include_comments. Returns summary_text (changelog) and data.events[] (rev, author, changed_at, field, old, new).',
    args: [
      { name: 'work_item_id', type: 'number', required: true },
      { name: 'top', type: 'number', required: false },
      { name: 'summary_only', type: 'boolean', required: false },
      { name: 'only_relevant_fields', type: 'boolean', required: false },
      { name: 'include_comments', type: 'boolean', required: false },
    ],
  },
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
  { name: 'azure_list_repositories', description: 'List Azure DevOps Git repositories. Optional project_name (defaults to AZURE_DEVOPS_PROJECT).' },
  { name: 'azure_list_tfvc_paths', description: 'List TFVC paths (folders/files). Optional path, recursion_level (None|OneLevel|Full), max_results.' },
  { name: 'azure_get_bug_changesets', description: 'List TFVC changesets linked to a bug. bug_id.' },
  { name: 'azure_get_changeset', description: 'Get a TFVC changeset: author, date, files. changeset_id.' },
  { name: 'azure_get_changeset_diff', description: 'Show the diff of a file in a changeset. changeset_id; optional file_index.' },
  { name: 'azure_get_file_history', description: 'Get TFVC history for a file path. file_path required; optional from_date, to_date, author, top, project_name.' },
  { name: 'azure_ingest_changesets_bootstrap', description: 'Bootstrap ingest of TFVC changesets for paths into remote Postgres (EC2) via SSH. Params: paths, from_date, optional to_date, top_per_path, dry_run.' },
  { name: 'azure_ingest_changesets_daily', description: 'Daily incremental ingest into remote Postgres. Params: paths, optional days_back, top_per_path, dry_run.' },
  { name: 'azure_ingest_changesets_bootstrap_start', description: 'Start async bootstrap ingestion job and return job_id. Poll with azure_ingest_changesets_job_status.' },
  { name: 'azure_ingest_changesets_daily_start', description: 'Start async daily ingestion job and return job_id. Poll with azure_ingest_changesets_job_status.' },
  { name: 'azure_ingest_changesets_job_status', description: 'Get ingestion job progress/status by job_id (percent, stage, counters, result/error).' },
  { name: 'azure_count_changesets', description: 'Count TFVC changesets with filters. project, author, from_date, to_date, max_count.' },
  { name: 'azure_list_changesets', description: 'List TFVC changesets with filters. project, author, from_date, to_date, top (paginates internally).' },
  { name: 'azure_list_changeset_authors', description: 'List authors with changesets. Optional project; optional max_scan.' },
  {
    name: 'tree_sitter_parse',
    description: 'Parse a source file with Tree-sitter and return the AST as S-expression. Also supports summary_only for automation-friendly metadata.',
    args: [
      { name: 'file_path', type: 'string', required: true, description: 'Path relative to project root or absolute.' },
      { name: 'summary_only', type: 'boolean', required: false, description: 'If true, omits the AST body and returns only summary metadata.' },
      { name: 'max_top_node_types', type: 'number', required: false, description: 'Limit for top node types in summary (default 12).' },
      { name: 'max_interesting_nodes', type: 'number', required: false, description: 'Limit for interesting nodes in summary (default 20).' },
    ],
    examples: [
      { title: 'Parse a TS file', args: { file_path: 'gateway/src/mcp-server.ts' } },
      { title: 'Get summary only', args: { file_path: 'blueivory/blueivory/ALO/ALOHelper.cpp', summary_only: true } },
    ],
  },
  {
    name: 'semgrep_scan',
    description: 'Run Semgrep static analysis on a directory. Returns human summary plus machine-readable metadata after <!--SEMGREP_V2-->. Optional config, format, timeout_ms, include, exclude.',
    args: [
      { name: 'path', type: 'string', required: true, description: 'Directory to scan (relative to project root or absolute).' },
      { name: 'config', type: 'string', required: false, description: 'E.g. auto, p/javascript, p/typescript.' },
      { name: 'format', type: 'string', required: false, enum: ['text', 'json'] },
      { name: 'timeout_ms', type: 'number', required: false, description: 'Optional timeout in milliseconds (clamped to safe limits).' },
      { name: 'include', type: 'string', required: false, description: 'Optional comma-separated include glob patterns.' },
      { name: 'exclude', type: 'string', required: false, description: 'Optional comma-separated exclude glob patterns.' },
    ],
    examples: [
      { title: 'Scan gateway', args: { path: 'gateway', config: 'auto' } },
      { title: 'Scan candidate C++ folder', args: { path: 'blueivory/blueivory/ALO', config: 'p/cpp', format: 'json', timeout_ms: 45000 } },
    ],
    notes: [
      'Requires semgrep installed on the system.',
      'Best used on focused subdirectories instead of entire repos for automation flows.',
    ],
  },
  {
    name: 'read_file_region',
    description:
      'Read an exact file region from blueivory or classic. Supports either start_line/end_line or line with context_before/context_after. Returns summary_text plus data.file_path, data.start_line, data.end_line, data.content, and meta.',
    args: [
      { name: 'file_path', type: 'string', required: true, description: "Relative path starting with blueivory or classic." },
      { name: 'start_line', type: 'number', required: false, description: '1-based start line.' },
      { name: 'end_line', type: 'number', required: false, description: '1-based end line.' },
      { name: 'line', type: 'number', required: false, description: 'Anchor line for context window mode.' },
      { name: 'context_before', type: 'number', required: false, description: 'Lines before anchor (default 20).' },
      { name: 'context_after', type: 'number', required: false, description: 'Lines after anchor (default 20).' },
    ],
    examples: [
      { title: 'Exact region', args: { file_path: 'blueivory/ExpExpl/ItemPaymentUI.cpp', start_line: 120, end_line: 180 } },
      { title: 'Anchor plus context', args: { file_path: 'classic/ExpExpl/SalesOrderPage.cpp', line: 240, context_before: 30, context_after: 30 } },
    ],
    notes: ['Region is truncated to a safe line count if too large.', 'Path must not be absolute or contain ..'],
  },
  {
    name: 'grep_code',
    description:
      'Search with ripgrep (rg) in blueivory or classic. Exact/regex matches. Returns envelope: summary_text, data.matches (file, line, column, text, context), meta. Complements search_docs.',
    args: [
      { name: 'pattern', type: 'string', required: true, description: 'Regex or literal search pattern.' },
      { name: 'path', type: 'string', required: false, description: "Default 'blueivory'. Only 'blueivory' or 'classic' (and subpaths)." },
      { name: 'include', type: 'string', required: false, description: 'Glob, e.g. *.{cpp,h,hpp,c,cc,cxx}' },
      { name: 'ignore_case', type: 'boolean', required: false },
      { name: 'max_matches', type: 'number', required: false, description: 'Default 200, min 1 max 2000.' },
      { name: 'context_lines', type: 'number', required: false, description: 'Lines before/after match, 0–3.' },
    ],
    examples: [
      { title: 'Find symbol in blueivory', args: { pattern: 'AmountPaidInPaymentCurrency', path: 'blueivory' } },
      { title: 'Case-insensitive in classic', args: { pattern: 'Trial balance', path: 'classic', ignore_case: true } },
    ],
    notes: ['Requires ripgrep (rg) installed. Path must not be absolute or contain ..'],
  },
  {
    name: 'grep_symbols',
    description:
      'Extract C/C++ symbols (function, class, struct, namespace) in blueivory or classic. Returns envelope: summary_text, data.counts, data.symbols. Useful for flow and entrypoints.',
    args: [
      { name: 'query', type: 'string', required: false, description: 'Filter symbols by name (partial).' },
      { name: 'path', type: 'string', required: false, description: "Default 'blueivory'. Only blueivory or classic." },
      { name: 'symbol_types', type: 'string[]', required: false, description: "Default all. Values: 'function','class','struct','namespace'." },
      { name: 'max_results', type: 'number', required: false, description: 'Default 300, max 3000.' },
      { name: 'include', type: 'string', required: false, description: 'Glob for file types, default *.{h,hpp,c,cpp,...}' },
    ],
    examples: [
      { title: 'Functions and classes in blueivory', args: { path: 'blueivory', symbol_types: ['function', 'class'] } },
      { title: 'Symbols named Invoice', args: { query: 'Invoice', path: 'blueivory' } },
    ],
    notes: ['Requires ripgrep (rg) installed. Heuristic extraction, not full parser.'],
  },
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
