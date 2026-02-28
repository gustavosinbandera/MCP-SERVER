'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type AzureWorkItemRow = {
  id: number;
  title: string;
  state: string;
  type: string;
  assignedTo: string;
  createdBy: string;
  createdDate: string;
  changedDate: string;
  areaPath: string;
  webUrl?: string;
};

type AzureListResponse = {
  from: string;
  to: string;
  count: number;
  items: AzureWorkItemRow[];
};

type AzureDetailResponse = {
  id: number;
  webUrl?: string;
  fields: Record<string, unknown>;
  relations: { rel?: string; url?: string }[];
  changesetIds: number[];
};

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgoIsoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function safeStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    const any = v as { displayName?: unknown; uniqueName?: unknown; name?: unknown };
    const displayName = typeof any.displayName === 'string' ? any.displayName : '';
    const uniqueName = typeof any.uniqueName === 'string' ? any.uniqueName : '';
    const name = typeof any.name === 'string' ? any.name : '';
    return displayName || name || uniqueName || '';
  }
  return String(v);
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export default function AzureTasksPage() {
  const [from, setFrom] = useState(daysAgoIsoDate(7));
  const [to, setTo] = useState(todayIsoDate());
  const [assignedTo, setAssignedTo] = useState('');
  const [dateField, setDateField] = useState<'created' | 'changed'>('created');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AzureListResponse | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AzureDetailResponse | null>(null);

  const rows = data?.items || [];
  const hasRows = rows.length > 0;

  const summary = useMemo(() => {
    if (!data) return '';
    return `${data.count} tarea(s) (${data.from} → ${data.to})`;
  }, [data]);

  const fetchList = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const q = new URLSearchParams();
      q.set('from', from);
      q.set('to', to);
      q.set('dateField', dateField);
      if (assignedTo.trim()) q.set('assignedTo', assignedTo.trim());
      const res = await fetch(`/api/azure/work-items?${q.toString()}`);
      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const body = isJson ? await res.json() : { error: await res.text() };
      if (!res.ok) throw new Error(body?.error || res.statusText);
      setData(body as AzureListResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (id: number) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/azure/work-items/${id}`);
      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const body = isJson ? await res.json() : { error: await res.text() };
      if (!res.ok) throw new Error(body?.error || res.statusText);
      setDetail(body as AzureDetailResponse);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const f = detail?.fields || {};
  const title = safeStr(f['System.Title']);
  const wiType = safeStr(f['System.WorkItemType']);
  const state = safeStr(f['System.State']);
  const assigned = safeStr(f['System.AssignedTo']);
  const createdBy = safeStr(f['System.CreatedBy']);
  const createdDate = safeStr(f['System.CreatedDate']);
  const changedDate = safeStr(f['System.ChangedDate']);
  const areaPath = safeStr(f['System.AreaPath']);
  const tags = safeStr(f['System.Tags']);
  const description = stripHtml(safeStr(f['System.Description']));

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 1100, margin: '0 auto', padding: '1rem', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: 8 }}>Tareas Azure (Work Items)</h1>
      <p style={{ marginBottom: 16, color: '#555' }}>
        Lista work items creados o modificados en un rango de fechas, con filtro por asignado.
      </p>
      <p style={{ marginBottom: 16 }}>
        <Link href="/" style={{ color: '#0066cc' }}>Inicio</Link>
        {' · '}
        <Link href="/upload" style={{ color: '#0066cc' }}>Subir al índice / KB</Link>
        {' · '}
        <Link href="/files" style={{ color: '#0066cc' }}>Explorador de archivos</Link>
      </p>

      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          padding: '12px',
          border: '1px solid #e3e3e3',
          borderRadius: 8,
          background: '#fafafa',
          marginBottom: 16,
        }}
      >
        <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          Desde
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          Hasta
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 14, minWidth: 220 }}>
          Asignado a (opcional)
          <input
            type="text"
            value={assignedTo}
            placeholder="ej. gustavo grisales"
            onChange={(e) => setAssignedTo(e.target.value)}
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          Campo fecha
          <select value={dateField} onChange={(e) => setDateField(e.target.value === 'changed' ? 'changed' : 'created')}>
            <option value="created">CreatedDate</option>
            <option value="changed">ChangedDate</option>
          </select>
        </label>
        <button
          type="button"
          onClick={fetchList}
          disabled={loading}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #ccc',
            background: loading ? '#eee' : '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
        {summary && <div style={{ fontSize: 13, color: '#444', paddingBottom: 6 }}>{summary}</div>}
      </div>

      {error && <p style={{ color: '#c00', padding: 12, background: '#fee', borderRadius: 6 }}>{error}</p>}

      {!loading && !error && (
        <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', width: 90 }}>ID</th>
                <th style={{ padding: '10px 12px' }}>Título</th>
                <th style={{ padding: '10px 12px', width: 120 }}>Tipo</th>
                <th style={{ padding: '10px 12px', width: 120 }}>Estado</th>
                <th style={{ padding: '10px 12px', width: 210 }}>Asignado</th>
                <th style={{ padding: '10px 12px', width: 180 }}>Creado</th>
                <th style={{ padding: '10px 12px', width: 180 }}>Modificado</th>
              </tr>
            </thead>
            <tbody>
              {!data && (
                <tr>
                  <td colSpan={7} style={{ padding: 20, color: '#666' }}>
                    Ingresa un rango de fechas y presiona “Buscar”.
                  </td>
                </tr>
              )}
              {data && !hasRows && (
                <tr>
                  <td colSpan={7} style={{ padding: 20, color: '#666' }}>
                    Sin resultados.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderTop: '1px solid #eee', cursor: 'pointer' }}
                  onClick={() => openDetail(r.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      openDetail(r.id);
                    }
                  }}
                  title="Click para ver detalles"
                >
                  <td style={{ padding: '8px 12px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                    {r.id}
                  </td>
                  <td style={{ padding: '8px 12px' }}>{r.title}</td>
                  <td style={{ padding: '8px 12px', color: '#555' }}>{r.type}</td>
                  <td style={{ padding: '8px 12px', color: '#555' }}>{r.state}</td>
                  <td style={{ padding: '8px 12px', color: '#555' }}>{r.assignedTo || '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#555' }}>{formatDate(r.createdDate)}</td>
                  <td style={{ padding: '8px 12px', color: '#555' }}>{formatDate(r.changedDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setDetailOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(920px, 100%)',
              maxHeight: '85vh',
              overflow: 'auto',
              background: '#fff',
              borderRadius: 10,
              border: '1px solid #ddd',
              boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #eee', display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: '#666' }}>Work Item</div>
                <div style={{ fontSize: 18, fontWeight: 650 }}>
                  {detail ? `#${detail.id} ${title}` : 'Cargando…'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
              >
                Cerrar
              </button>
            </div>

            <div style={{ padding: 14 }}>
              {detailLoading && <p>Cargando detalle…</p>}
              {detailError && <p style={{ color: '#c00', padding: 12, background: '#fee', borderRadius: 6 }}>{detailError}</p>}
              {!detailLoading && detail && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
                    <div><b>Tipo</b>: {wiType || '—'}</div>
                    <div><b>Estado</b>: {state || '—'}</div>
                    <div><b>Asignado</b>: {assigned || '—'}</div>
                    <div><b>Creado por</b>: {createdBy || '—'}</div>
                    <div><b>Creado</b>: {createdDate ? formatDate(createdDate) : '—'}</div>
                    <div><b>Modificado</b>: {changedDate ? formatDate(changedDate) : '—'}</div>
                    <div><b>Área</b>: {areaPath || '—'}</div>
                    <div><b>Tags</b>: {tags || '—'}</div>
                  </div>

                  {detail.webUrl && (
                    <p style={{ marginBottom: 12 }}>
                      <a href={detail.webUrl} target="_blank" rel="noreferrer" style={{ color: '#0066cc' }}>
                        Abrir en Azure DevOps
                      </a>
                    </p>
                  )}

                  {detail.changesetIds?.length > 0 && (
                    <p style={{ marginBottom: 12, color: '#444' }}>
                      <b>Changesets vinculados</b>: {detail.changesetIds.join(', ')}
                    </p>
                  )}

                  {description && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 650, marginBottom: 6 }}>Descripción</div>
                      <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 12, borderRadius: 8, border: '1px solid #eee' }}>
                        {description}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

