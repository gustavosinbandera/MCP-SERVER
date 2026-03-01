'use client';

import { useEffect, useMemo, useState } from 'react';

type ToolArgHelp = {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  enum?: string[];
};

type ToolExample = {
  title: string;
  args: Record<string, unknown>;
};

type ToolCatalogEntry = {
  name: string;
  description: string;
  args?: ToolArgHelp[];
  examples?: ToolExample[];
  notes?: string[];
};

type ToolsListResponse = {
  count: number;
  tools: ToolCatalogEntry[];
};

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL;

type ToolGroupId =
  | 'azure'
  | 'clickup'
  | 'indexing'
  | 'instance'
  | 'git'
  | 'shared'
  | 'urls'
  | 'docs'
  | 'other';

type ToolGroup = {
  id: ToolGroupId;
  label: string;
  tools: ToolCatalogEntry[];
};

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function groupLabel(id: ToolGroupId): string {
  switch (id) {
    case 'azure': return 'Azure';
    case 'clickup': return 'ClickUp';
    case 'indexing': return 'Indexing';
    case 'instance': return 'Instance';
    case 'git': return 'Git';
    case 'shared': return 'Shared';
    case 'urls': return 'URLs';
    case 'docs': return 'Docs';
    default: return 'Other';
  }
}

function toolGroupId(name: string): ToolGroupId {
  if (name === 'azure' || name.startsWith('azure_')) return 'azure';
  if (name.startsWith('clickup_')) return 'clickup';
  if (name.startsWith('index_') || name === 'index_url' || name === 'index_site' || name === 'index_url_with_links') return 'indexing';
  if (name.startsWith('instance_')) return 'instance';
  if (name.startsWith('repo_') || name === 'repo_git' || name === 'repo_pull') return 'git';
  if (name.startsWith('list_shared_') || name.startsWith('read_shared_')) return 'shared';
  if (name === 'list_url_links' || name === 'view_url' || name === 'mediawiki_login') return 'urls';
  if (name === 'search_docs' || name === 'count_docs' || name === 'analize_code' || name === 'write_flow_doc' || name === 'documentar_sesion') return 'docs';
  return 'other';
}

function titleCaseWords(s: string): string {
  return s
    .split(' ')
    .filter(Boolean)
    .map((w) => w.length <= 2 ? w.toUpperCase() : (w[0]?.toUpperCase() + w.slice(1)))
    .join(' ');
}

function uiToolLabel(toolName: string): string {
  // Special cases for clarity and to keep labels short.
  const special: Record<string, string> = {
    azure: 'List tasks (alias)',
    azure_add_work_item_comment: 'Add comment',
    azure_list_work_items: 'List work items',
    azure_get_work_item: 'Get work item',
    azure_get_work_item_updates: 'Work item updates',
    azure_bug_analysis_or_solution: 'Bug analysis / solution',
    azure_get_bug_changesets: 'Bug changesets',
    azure_get_changeset: 'Get changeset',
    azure_get_changeset_diff: 'Changeset diff',
    azure_count_changesets: 'Count changesets',
    azure_list_changesets: 'List changesets',
    azure_list_changeset_authors: 'List authors',

    clickup_list_workspaces: 'List workspaces',
    clickup_list_spaces: 'List spaces',
    clickup_list_folders: 'List folders',
    clickup_list_lists: 'List lists',
    clickup_list_tasks: 'List tasks',
    clickup_get_task: 'Get task',
    clickup_create_task: 'Create task',
    clickup_update_task: 'Update task',
    clickup_create_subtask: 'Create subtask',
    clickup_add_comment: 'Add comment',
    clickup_complete_task_by_id: 'Complete task',

    index_url: 'Index URL',
    index_url_with_links: 'Index URL + links',
    index_site: 'Index site',

    instance_update: 'Update instance',
    instance_report: 'Instance report',
    instance_reboot: 'Reboot instance',

    repo_git: 'Git (safe)',
    repo_pull: 'Pull',

    list_shared_dir: 'List shared dir',
    read_shared_file: 'Read shared file',

    list_url_links: 'List links',
    view_url: 'View URL',
    mediawiki_login: 'MediaWiki login',

    search_docs: 'Search docs',
    count_docs: 'Count docs',
    analize_code: 'Analyze code',
    write_flow_doc: 'Write flow doc',
    documentar_sesion: 'Document session',
  };

  const hit = special[toolName];
  if (hit) return hit;

  // Default: remove group prefix and underscores.
  const grp = toolGroupId(toolName);
  let base = toolName;
  if (grp === 'azure') base = base.replace(/^azure_/, '');
  if (grp === 'clickup') base = base.replace(/^clickup_/, '');
  if (grp === 'instance') base = base.replace(/^instance_/, '');
  if (grp === 'git') base = base.replace(/^repo_/, '');
  base = base.replace(/_/g, ' ').trim();
  return titleCaseWords(base);
}

export default function McpToolsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tools, setTools] = useState<ToolCatalogEntry[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [filter, setFilter] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const baseUrl = GATEWAY_URL ? GATEWAY_URL.replace(/\/$/, '') : '';
  const listUrl = baseUrl ? `${baseUrl}/mcp/tools` : '/api/mcp/tools';

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(listUrl)
      .then((res) => {
        if (!res.ok) return res.json().then((b) => Promise.reject(new Error(b?.error || res.statusText)));
        return res.json() as Promise<ToolsListResponse>;
      })
      .then((data) => {
        const list = Array.isArray(data.tools) ? data.tools : [];
        setTools(list);
        if (!selected && list.length > 0) setSelected(list[0].name);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listUrl]);

  const filteredTools = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
  }, [tools, filter]);

  const groups = useMemo<ToolGroup[]>(() => {
    const map = new Map<ToolGroupId, ToolCatalogEntry[]>();
    for (const t of filteredTools) {
      const id = toolGroupId(t.name);
      const arr = map.get(id) ?? [];
      arr.push(t);
      map.set(id, arr);
    }

    const order: ToolGroupId[] = ['azure', 'indexing', 'docs', 'clickup', 'shared', 'urls', 'git', 'instance', 'other'];
    const out: ToolGroup[] = [];
    for (const id of order) {
      const arr = map.get(id);
      if (!arr || arr.length === 0) continue;
      arr.sort((a, b) => a.name.localeCompare(b.name));
      out.push({ id, label: groupLabel(id), tools: arr });
    }
    return out;
  }, [filteredTools]);

  const current = useMemo(() => tools.find((t) => t.name === selected) || null, [tools, selected]);

  // Ensure the selected tool's group is open.
  useEffect(() => {
    if (!selected) return;
    const gid = toolGroupId(selected);
    setOpenGroups((prev) => (prev[gid] ? prev : { ...prev, [gid]: true }));
  }, [selected]);

  // When filtering, auto-open groups that contain matches.
  useEffect(() => {
    const q = filter.trim();
    if (!q) return;
    const next: Record<string, boolean> = {};
    for (const g of groups) next[g.id] = true;
    setOpenGroups((prev) => ({ ...prev, ...next }));
  }, [filter, groups]);

  return (
    <main className="toolsPage">
      <div className="toolsPageHeader">
        <h1 className="pageTitle">MCP Tools</h1>
        <p className="pageSubtitle">Catalog of available tools (description, arguments, and examples).</p>
      </div>

      <div className="toolsGrid">
        <section className="panel toolsListPanel">
          <div className="panelInner toolsListInner">
            <div className="toolsListHeader">
              <div className="toolsFilterRow">
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter tools..."
                />
              </div>
              {loading && <p style={{ margin: 0 }}>Loading…</p>}
              {error && <p className="dangerText" style={{ margin: 0 }}>{error}</p>}
              {!loading && !error && (
                <div className="toolsCount">{filteredTools.length} tool(s)</div>
              )}
            </div>

            {!loading && !error && (
              <div className="toolsListScroll" role="list" aria-label="Tools list">
                {groups.map((g) => {
                  const isOpen = !!openGroups[g.id];
                  return (
                    <div key={g.id} className="toolsGroup" role="group" aria-label={`${g.label} tools`}>
                      <button
                        type="button"
                        className={`toolsGroupHeader${isOpen ? ' toolsGroupHeaderOpen' : ''}`}
                        onClick={() => setOpenGroups((prev) => ({ ...prev, [g.id]: !isOpen }))}
                        aria-expanded={isOpen}
                      >
                        <span className="toolsGroupChevron" aria-hidden="true" />
                        <span className="toolsGroupTitle">{g.label}</span>
                        <span className="toolsGroupCount">{g.tools.length}</span>
                      </button>
                      {isOpen && (
                        <div className="toolsGroupItems">
                          {g.tools.map((t) => (
                            <button
                              key={t.name}
                              type="button"
                              onClick={() => setSelected(t.name)}
                              className={`toolsListItem${t.name === selected ? ' toolsListItemActive' : ''}`}
                              title={`${t.name} — ${t.description}`}
                            >
                              <div className="toolsListItemName">{uiToolLabel(t.name)}</div>
                              <div className="toolsListItemDesc">{t.description}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="panel toolsDetailPanel">
          <div className="panelInner toolsDetailInner">
            <div className="toolsDetailScroll">
            {!current ? (
              <p className="muted">Select a tool to view details.</p>
            ) : (
              <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0 }}>{current.name}</h2>
                  <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>{current.description}</p>
                </div>
              </div>

              {current.notes && current.notes.length > 0 && (
                <div style={{ marginTop: 14, padding: 12, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Notes</div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text)' }}>
                    {current.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}

              <div style={{ marginTop: 18 }}>
                <h3 style={{ margin: '0 0 8px' }}>Arguments</h3>
                {(!current.args || current.args.length === 0) ? (
                  <p className="muted">No arguments documented.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '8px 6px' }}>Name</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '8px 6px' }}>Type</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '8px 6px' }}>Req</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '8px 6px' }}>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.args.map((a) => (
                        <tr key={a.name}>
                          <td style={{ padding: '8px 6px', verticalAlign: 'top', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>{a.name}</td>
                          <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>{a.type}{a.enum ? ` (${a.enum.join(' | ')})` : ''}</td>
                          <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>{a.required ? 'yes' : 'no'}</td>
                          <td style={{ padding: '8px 6px', verticalAlign: 'top', color: 'var(--muted)' }}>{a.description || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ marginTop: 18 }}>
                <h3 style={{ margin: '0 0 8px' }}>Examples</h3>
                {(!current.examples || current.examples.length === 0) ? (
                  <p className="muted">No examples yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {current.examples.map((ex, i) => (
                      <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--panel-2)' }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>{ex.title}</div>
                        <pre style={{ fontSize: 13 }}>
                          {prettyJson({ name: current.name, arguments: ex.args })}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 18 }}>
                <h3 style={{ margin: '0 0 8px' }}>How to run it (via MCP HTTP)</h3>
                <p style={{ margin: '0 0 8px', color: 'var(--muted)' }}>
                  To run tools from the web, the gateway exposes an MCP JSON-RPC endpoint at <code>/api/mcp</code> (JWT required).
                </p>
                <pre style={{ fontSize: 13 }}>
{`POST /api/mcp
Authorization: Bearer <ID_TOKEN>
mcp-session-id: <optional>

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "${current.name}",
    "arguments": { }
  }
}`}
                </pre>
              </div>
              </>
            )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

