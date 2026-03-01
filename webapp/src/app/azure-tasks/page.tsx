'use client';

import { useMemo, useState } from 'react';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL;

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

  const baseUrl = GATEWAY_URL ? GATEWAY_URL.replace(/\/$/, '') : '';
  const workItemsUrl = baseUrl ? `${baseUrl}/azure/work-items` : '/api/azure/work-items';

  const rows = data?.items || [];
  const hasRows = rows.length > 0;

  const summary = useMemo(() => {
    if (!data) return '';
    return `${data.count} item(s) (${data.from} → ${data.to})`;
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
      const res = await fetch(`${workItemsUrl}?${q.toString()}`);
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
      const res = await fetch(`${workItemsUrl}/${id}`);
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
    <main>
      <h1 className="pageTitle">Azure (Work Items)</h1>
      <p className="pageSubtitle">
        List work items created or changed in a date range, with an optional assignee filter.
      </p>

      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          padding: '12px',
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'var(--panel)',
          marginBottom: 16,
        }}
      >
        <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 14, minWidth: 220 }}>
          Assigned to (optional)
          <input
            type="text"
            value={assignedTo}
            placeholder="e.g. John Smith"
            onChange={(e) => setAssignedTo(e.target.value)}
          />
        </label>
        <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
          Date field
          <select value={dateField} onChange={(e) => setDateField(e.target.value === 'changed' ? 'changed' : 'created')}>
            <option value="created">CreatedDate</option>
            <option value="changed">ChangedDate</option>
          </select>
        </label>
        <button
          type="button"
          onClick={fetchList}
          disabled={loading}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
        {summary && <div className="muted2" style={{ fontSize: 13, paddingBottom: 6 }}>{summary}</div>}
      </div>

      {error && (
        <p
          className="dangerText"
          style={{ padding: 12, background: 'rgba(255, 107, 107, 0.14)', borderRadius: 12, border: '1px solid var(--border)' }}
        >
          {error}
        </p>
      )}

      {!loading && !error && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel)' }}>
          <div style={{ overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', minWidth: 1120, borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.06)', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', width: 90 }}>ID</th>
                <th style={{ padding: '10px 12px' }}>Title</th>
                <th style={{ padding: '10px 12px', width: 120 }}>Type</th>
                <th style={{ padding: '10px 12px', width: 120 }}>State</th>
                <th style={{ padding: '10px 12px', width: 210 }}>Assigned to</th>
                <th style={{ padding: '10px 12px', width: 180 }}>Created</th>
                <th style={{ padding: '10px 12px', width: 180 }}>Changed</th>
              </tr>
            </thead>
            <tbody>
              {!data && (
                <tr>
                  <td colSpan={7} style={{ padding: 20, color: 'var(--muted)' }}>
                    Enter a date range and click “Search”.
                  </td>
                </tr>
              )}
              {data && !hasRows && (
                <tr>
                  <td colSpan={7} style={{ padding: 20, color: 'var(--muted)' }}>
                    No results.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderTop: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
                  onClick={() => openDetail(r.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      openDetail(r.id);
                    }
                  }}
                  title="Click to view details"
                >
                  <td style={{ padding: '8px 12px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                    {r.id}
                  </td>
                  <td style={{ padding: '8px 12px' }}>{r.title}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{r.type}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{r.state}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{r.assignedTo || '—'}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{formatDate(r.createdDate)}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{formatDate(r.changedDate)}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}

      {detailOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setDetailOpen(false)}
          className="modalOverlay"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="modalCard"
          >
            <div className="modalHeader">
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>Work Item</div>
                <div style={{ fontSize: 18, fontWeight: 650 }}>
                  {detail ? `#${detail.id} ${title}` : 'Loading…'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="modalBody">
              {detailLoading && <p>Loading details…</p>}
              {detailError && (
                <p className="dangerText" style={{ padding: 12, background: 'rgba(255, 107, 107, 0.14)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  {detailError}
                </p>
              )}
              {!detailLoading && detail && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
                    <div><b>Type</b>: {wiType || '—'}</div>
                    <div><b>State</b>: {state || '—'}</div>
                    <div><b>Assigned to</b>: {assigned || '—'}</div>
                    <div><b>Created by</b>: {createdBy || '—'}</div>
                    <div><b>Created</b>: {createdDate ? formatDate(createdDate) : '—'}</div>
                    <div><b>Changed</b>: {changedDate ? formatDate(changedDate) : '—'}</div>
                    <div><b>Area</b>: {areaPath || '—'}</div>
                    <div><b>Tags</b>: {tags || '—'}</div>
                  </div>

                  {detail.webUrl && (
                    <p style={{ marginBottom: 12 }}>
                      <a href={detail.webUrl} target="_blank" rel="noreferrer">
                        Open in Azure DevOps
                      </a>
                    </p>
                  )}

                  {detail.changesetIds?.length > 0 && (
                    <p style={{ marginBottom: 12, color: 'var(--muted)' }}>
                      <b>Linked changesets</b>: {detail.changesetIds.join(', ')}
                    </p>
                  )}

                  {description && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 650, marginBottom: 6 }}>Description</div>
                      <pre style={{ whiteSpace: 'pre-wrap' }}>
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

