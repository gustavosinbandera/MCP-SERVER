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

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function McpToolsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tools, setTools] = useState<ToolCatalogEntry[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [filter, setFilter] = useState('');

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

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
  }, [tools, filter]);

  const current = useMemo(() => tools.find((t) => t.name === selected) || null, [tools, selected]);

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
                <div className="toolsCount">{filtered.length} tool(s)</div>
              )}
            </div>

            {!loading && !error && (
              <div className="toolsListScroll" role="list" aria-label="Tools list">
                {filtered.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setSelected(t.name)}
                    className={`toolsListItem${t.name === selected ? ' toolsListItemActive' : ''}`}
                    title={t.description}
                  >
                    <div className="toolsListItemName">{t.name}</div>
                    <div className="toolsListItemDesc">{t.description}</div>
                  </button>
                ))}
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

