'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChangesetDiffModal } from '../../components/ChangesetDiffModal';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL;

const DEFAULT_HIDDEN_TYPES = ['Test Case', 'Code Review Request', 'Product Backlog Item', 'Test Suite'] as const;
const DEFAULT_HIDDEN_TYPE_SET = new Set(DEFAULT_HIDDEN_TYPES.map((t) => t.toLowerCase()));

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
  changesetIds?: number[];
  changesetCount?: number;
  parentId?: number | null;
  isSubtask?: boolean;
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

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function normType(t: string): string {
  return String(t || '').trim().toLowerCase();
}

export default function AzureChangesetsPage() {
  // Work items filters (same idea as Azure Tasks).
  const [from, setFrom] = useState(daysAgoIsoDate(7));
  const [to, setTo] = useState(todayIsoDate());
  const [assignedTo, setAssignedTo] = useState('');
  const [dateField, setDateField] = useState<'created' | 'changed'>('created');
  const [top, setTop] = useState(100);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AzureListResponse | null>(null);

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AzureDetailResponse | null>(null);
  const [fallbackChangesetIds, setFallbackChangesetIds] = useState<number[]>([]);

  const [modalOpen, setModalOpen] = useState(false);

  const baseUrl = GATEWAY_URL ? GATEWAY_URL.replace(/\/$/, '') : '';
  const workItemsUrl = baseUrl ? `${baseUrl}/azure/work-items` : '/api/azure/work-items';
  const changesetsUrl = baseUrl ? `${baseUrl}/azure/changesets` : '/api/azure/changesets';

  const rows = data?.items || [];
  const rowsWithChangesets = useMemo(() => {
    return rows.filter((r) => {
      const csCount = (r.changesetCount ?? (r.changesetIds?.length ?? 0)) || 0;
      if (csCount <= 0) return false;
      if (r.isSubtask) return false;
      if (r.parentId && r.parentId > 0) return false;
      if (DEFAULT_HIDDEN_TYPE_SET.has(normType(r?.type || ''))) return false;
      return true;
    });
  }, [rows]);

  const [pageSize, setPageSize] = useState<10 | 15 | 20>(15);
  const [pageIdx, setPageIdx] = useState(0);

  const pageCount = Math.max(1, Math.ceil(rowsWithChangesets.length / pageSize));
  const clampedPageIdx = Math.min(Math.max(0, pageIdx), Math.max(0, pageCount - 1));
  const pageRows = useMemo(() => {
    const start = clampedPageIdx * pageSize;
    return rowsWithChangesets.slice(start, start + pageSize);
  }, [clampedPageIdx, pageSize, rowsWithChangesets]);

  useEffect(() => {
    setPageIdx(0);
  }, [data, pageSize]);

  useEffect(() => {
    if (pageIdx !== clampedPageIdx) setPageIdx(clampedPageIdx);
  }, [clampedPageIdx, pageIdx]);

  const summary = useMemo(() => {
    if (!data) return '';
    const withCs = rowsWithChangesets.length;
    return `${withCs} work item(s) with changesets (${data.from} → ${data.to})`;
  }, [data, rowsWithChangesets.length]);

  const fetchList = async (opts?: { auto?: boolean }) => {
    setLoading(true);
    setError(null);
    if (!opts?.auto) setData(null);
    try {
      const want = Math.min(Math.max(1, top || 100), 1000);
      const pageSize = 200;
      let skip = 0;
      let scanned = 0;
      const kept: AzureWorkItemRow[] = [];

      while (kept.length < want) {
        const q = new URLSearchParams();
        q.set('from', from);
        q.set('to', to);
        q.set('dateField', dateField);
        q.set('includeChangesets', '1');
        q.set('top', String(pageSize));
        q.set('skip', String(skip));
        if (assignedTo.trim()) q.set('assignedTo', assignedTo.trim());

        const res = await fetch(`${workItemsUrl}?${q.toString()}`);
        const isJson = (res.headers.get('content-type') || '').includes('application/json');
        const body = isJson ? await res.json() : { error: await res.text() };
        if (!res.ok) throw new Error(body?.error || res.statusText);

        const page = body as AzureListResponse;
        const items = Array.isArray(page.items) ? page.items : [];
        scanned += items.length;

        const pageKept = items.filter((r) => {
          const csCount = (r.changesetCount ?? (r.changesetIds?.length ?? 0)) || 0;
          if (csCount <= 0) return false;
          if (r.isSubtask) return false;
          if (r.parentId && r.parentId > 0) return false;
          if (DEFAULT_HIDDEN_TYPE_SET.has(normType(r?.type || ''))) return false;
          return true;
        });
        kept.push(...pageKept);

        if (items.length < pageSize) {
          // no more pages
          setData({ from: page.from, to: page.to, count: kept.length, items: kept.slice(0, want) });
          return;
        }
        // next page
        skip += items.length;

        // Safety cap to avoid scanning huge datasets accidentally.
        if (scanned >= 5000) break;
      }

      // Use last-known from/to range even if we stopped early.
      setData({ from, to, count: kept.slice(0, want).length, items: kept.slice(0, want) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const openWorkItem = async (row: AzureWorkItemRow) => {
    setModalOpen(true);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    setFallbackChangesetIds(Array.isArray(row.changesetIds) ? row.changesetIds : []);
    try {
      const res = await fetch(`${workItemsUrl}/${row.id}`);
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

  // Auto-load "my recent work items" on first render (same defaults as Azure Tasks).
  useEffect(() => {
    fetchList({ auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const linkedIds = useMemo(() => {
    const fromDetail = detail?.changesetIds;
    if (Array.isArray(fromDetail) && fromDetail.length > 0) return fromDetail;
    return fallbackChangesetIds;
  }, [detail?.changesetIds, fallbackChangesetIds]);

  return (
    <main className="changesetsPage">
      <div className="changesetsHeader">
        <h1 className="pageTitle">Azure (Changesets)</h1>
        <p className="pageSubtitle">
          Find changesets by browsing work items, then opening linked changesets.
        </p>
      </div>

      <div className="panel changesetsFilters">
        <div className="panelInner" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
          <label style={{ display: 'grid', gap: 6, fontSize: 14, width: 120 }}>
            Top
            <input
              type="number"
              min={1}
              max={200}
              value={top}
              onChange={(e) => setTop(Math.min(Math.max(1, parseInt(e.target.value || '100', 10) || 100), 200))}
            />
          </label>
          <button type="button" onClick={() => fetchList()} disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
          {summary && <div className="muted2" style={{ fontSize: 13, paddingBottom: 6 }}>{summary}</div>}
        </div>
      </div>

      {error && (
        <p className="dangerText" style={{ padding: 12, background: 'rgba(255, 107, 107, 0.14)', borderRadius: 12, border: '1px solid var(--border)' }}>
          {error}
        </p>
      )}

      <section className="panel changesetsListPanel">
        <div className="panelInner changesetsListInner">
          <div className="changesetsListScroll" aria-label="Work items with changesets list">
            {data && rowsWithChangesets.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  padding: '10px 12px',
                  borderBottom: '1px solid color-mix(in srgb, var(--border) 75%, transparent)',
                  background: 'var(--panel-2)',
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  marginBottom: 8,
                }}
              >
                <div className="muted2" style={{ fontSize: 13 }}>
                  Showing {clampedPageIdx * pageSize + 1}–{Math.min((clampedPageIdx + 1) * pageSize, rowsWithChangesets.length)} of {rowsWithChangesets.length}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    Per page
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize((Number(e.target.value) as 10 | 15 | 20) || 15)}
                      style={{ width: 110 }}
                    >
                      <option value={10}>10</option>
                      <option value={15}>15</option>
                      <option value={20}>20</option>
                    </select>
                  </label>
                  <div className="muted2" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                    Page {clampedPageIdx + 1}/{pageCount}
                  </div>
                  <button type="button" onClick={() => setPageIdx((p) => Math.max(0, p - 1))} disabled={clampedPageIdx <= 0}>
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageIdx((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={clampedPageIdx >= pageCount - 1}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            <table className="stickyTable" style={{ width: '100%', minWidth: 1120, borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.06)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', width: 90 }}>ID</th>
                    <th style={{ padding: '10px 12px' }}>Title</th>
                    <th style={{ padding: '10px 12px', width: 120 }}>Type</th>
                    <th style={{ padding: '10px 12px', width: 120 }}>State</th>
                    <th style={{ padding: '10px 12px', width: 210 }}>Assigned to</th>
                    <th style={{ padding: '10px 12px', width: 110 }}>Changesets</th>
                    <th style={{ padding: '10px 12px', width: 180 }}>Created</th>
                    <th style={{ padding: '10px 12px', width: 180 }}>Changed</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={8} style={{ padding: 20 }}>
                        <span className="spinnerRow">
                          <span className="spinner" aria-hidden="true" />
                          Loading work items…
                        </span>
                      </td>
                    </tr>
                  )}
                  {!data && !loading && (
                    <tr>
                      <td colSpan={7} style={{ padding: 20, color: 'var(--muted)' }}>
                        Click “Search” to load work items, then open one to view its linked changesets.
                      </td>
                    </tr>
                  )}
                  {data && rowsWithChangesets.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: 20, color: 'var(--muted)' }}>
                        No work items with linked changesets found for those filters.
                      </td>
                    </tr>
                  )}
                  {!loading && pageRows.map((r) => (
                    <tr
                      key={r.id}
                      style={{ borderTop: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
                      onClick={() => openWorkItem(r)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          openWorkItem(r);
                        }
                      }}
                      title="Click to view linked changesets"
                    >
                      <td style={{ padding: '8px 12px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                        {r.id}
                      </td>
                      <td style={{ padding: '8px 12px' }}>{r.title}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{r.type}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{r.state}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{r.assignedTo || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>
                        {(r.changesetCount ?? (r.changesetIds?.length ?? 0)) || '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{formatDate(r.createdDate)}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{formatDate(r.changedDate)}</td>
                    </tr>
                  ))}
                </tbody>
            </table>
          </div>
        </div>
      </section>

      <ChangesetDiffModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={detail ? `Work Item #${detail.id} — linked changesets` : 'Linked changesets'}
        linkUrl={detail?.webUrl}
        linkLabel="Open work item in Azure DevOps"
        changesetIds={linkedIds}
        changesetsUrl={changesetsUrl}
        topContent={
          detailLoading ? (
            <p className="spinnerRow" style={{ marginTop: 0 }}>
              <span className="spinner" aria-hidden="true" />
              Loading work item…
            </p>
          ) : detailError ? (
            <p className="dangerText" style={{ padding: 12, background: 'rgba(255, 107, 107, 0.14)', borderRadius: 12, border: '1px solid var(--border)' }}>
              {detailError}
            </p>
          ) : undefined
        }
        initialChangesetId={null}
      />
    </main>
  );
}

