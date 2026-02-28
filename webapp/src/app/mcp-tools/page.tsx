'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

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
    <main style={{ fontFamily: 'system-ui', maxWidth: 1100, margin: '0 auto', padding: '1rem', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: 8 }}>MCP Tools</h1>
      <p style={{ marginBottom: 16, color: '#555' }}>
        Catálogo de herramientas disponibles (descripción, argumentos y ejemplos).
      </p>
      <p style={{ marginBottom: 16 }}>
        <Link href="/" style={{ color: '#0066cc' }}>Inicio</Link>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, alignItems: 'start' }}>
        <section style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrar tools..."
              style={{ flex: 1, padding: 8 }}
            />
          </div>
          {loading && <p>Cargando…</p>}
          {error && <p style={{ color: '#b00' }}>{error}</p>}
          {!loading && !error && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>
                {filtered.length} tool(s)
              </div>
              {filtered.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setSelected(t.name)}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #e5e5e5',
                    background: t.name === selected ? '#f3f7ff' : '#fff',
                    cursor: 'pointer',
                  }}
                  title={t.description}
                >
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.description}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16 }}>
          {!current ? (
            <p style={{ color: '#666' }}>Selecciona una tool para ver detalles.</p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0 }}>{current.name}</h2>
                  <p style={{ margin: '8px 0 0', color: '#555' }}>{current.description}</p>
                </div>
              </div>

              {current.notes && current.notes.length > 0 && (
                <div style={{ marginTop: 14, padding: 12, background: '#fff6e5', border: '1px solid #ffe0a3', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Notas</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {current.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}

              <div style={{ marginTop: 18 }}>
                <h3 style={{ margin: '0 0 8px' }}>Argumentos</h3>
                {(!current.args || current.args.length === 0) ? (
                  <p style={{ color: '#666' }}>Sin argumentos documentados.</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px 6px' }}>Nombre</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px 6px' }}>Tipo</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px 6px' }}>Req</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px 6px' }}>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.args.map((a) => (
                        <tr key={a.name}>
                          <td style={{ padding: '8px 6px', verticalAlign: 'top', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>{a.name}</td>
                          <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>{a.type}{a.enum ? ` (${a.enum.join(' | ')})` : ''}</td>
                          <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>{a.required ? 'sí' : 'no'}</td>
                          <td style={{ padding: '8px 6px', verticalAlign: 'top', color: '#555' }}>{a.description || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ marginTop: 18 }}>
                <h3 style={{ margin: '0 0 8px' }}>Ejemplos</h3>
                {(!current.examples || current.examples.length === 0) ? (
                  <p style={{ color: '#666' }}>Sin ejemplos aún.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {current.examples.map((ex, i) => (
                      <div key={i} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>{ex.title}</div>
                        <pre style={{ margin: 0, padding: 12, background: '#111', color: '#eaeaea', overflowX: 'auto', borderRadius: 8 }}>
                          {prettyJson({ name: current.name, arguments: ex.args })}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 18 }}>
                <h3 style={{ margin: '0 0 8px' }}>Cómo ejecutarla (vía MCP HTTP)</h3>
                <p style={{ margin: '0 0 8px', color: '#555' }}>
                  Si quieres ejecutar tools desde la web, el gateway expone un endpoint MCP JSON-RPC en <code>/api/mcp</code> (requiere JWT).
                </p>
                <pre style={{ margin: 0, padding: 12, background: '#f6f6f6', overflowX: 'auto', borderRadius: 8, fontSize: 13 }}>
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
        </section>
      </div>
    </main>
  );
}

