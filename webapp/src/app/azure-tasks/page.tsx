'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChangesetDiffModal } from '../../components/ChangesetDiffModal';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL;

const DEFAULT_HIDDEN_TYPES = ['Test Case', 'Code Review Request', 'Product Backlog Item', 'Test Suite'] as const;

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

function normType(t: string): string {
  return String(t || '').trim().toLowerCase();
}

export default function AzureTasksPage() {
  const [from, setFrom] = useState(daysAgoIsoDate(7));
  const [to, setTo] = useState(todayIsoDate());
  const [assignedTo, setAssignedTo] = useState('');
  // Default to "changed" so long-running items still show up.
  const [dateField, setDateField] = useState<'created' | 'changed'>('changed');
  const [top, setTop] = useState(200);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AzureListResponse | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<string[]>([...DEFAULT_HIDDEN_TYPES]);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const typeMenuRef = useRef<HTMLDivElement | null>(null);
  const [pageSize, setPageSize] = useState<10 | 15 | 20>(15);
  const [pageIdx, setPageIdx] = useState(0);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AzureDetailResponse | null>(null);
  const [csModalOpen, setCsModalOpen] = useState(false);
  const [csModalInitialId, setCsModalInitialId] = useState<number | null>(null);

  const baseUrl = GATEWAY_URL ? GATEWAY_URL.replace(/\/$/, '') : '';
  const workItemsUrl = baseUrl ? `${baseUrl}/azure/work-items` : '/api/azure/work-items';
  const changesetsUrl = baseUrl ? `${baseUrl}/azure/changesets` : '/api/azure/changesets';

  const hiddenTypeSet = useMemo(() => new Set(hiddenTypes.map(normType)), [hiddenTypes]);
  useEffect(() => {
    if (!typeMenuOpen) return;
    const onDown = (ev: MouseEvent | TouchEvent) => {
      const el = typeMenuRef.current;
      if (!el) return;
      if (ev.target && el.contains(ev.target as Node)) return;
      setTypeMenuOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setTypeMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true } as any);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown as any);
      document.removeEventListener('keydown', onKey);
    };
  }, [typeMenuOpen]);
  const rows = (data?.items || []).filter((r) => {
    if (r?.isSubtask) return false;
    if (r?.parentId && r.parentId > 0) return false;
    if (hiddenTypeSet.has(normType(r?.type || ''))) return false;
    return true;
  });
  const hasRows = rows.length > 0;

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clampedPageIdx = Math.min(Math.max(0, pageIdx), Math.max(0, pageCount - 1));
  const pageRows = useMemo(() => {
    const start = clampedPageIdx * pageSize;
    return rows.slice(start, start + pageSize);
  }, [clampedPageIdx, pageSize, rows]);

  useEffect(() => {
    // Reset to first page on new data / filters.
    setPageIdx(0);
  }, [data, hiddenTypes, pageSize]);

  useEffect(() => {
    if (pageIdx !== clampedPageIdx) setPageIdx(clampedPageIdx);
  }, [clampedPageIdx, pageIdx]);

  const summary = useMemo(() => {
    if (!data) return '';
    const hidden = hiddenTypes.length ? ` · hidden: ${hiddenTypes.join(', ')}` : '';
    return `${rows.length} shown (${data.from} → ${data.to})${hidden}`;
  }, [data, hiddenTypes, rows.length]);

  const fetchList = async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      setPageIdx(0);
      const want = Math.min(Math.max(1, top || 200), 1000);
      const pageSize = 200; // gateway caps at 200
      let skip = 0;
      const kept: AzureWorkItemRow[] = [];

      while (kept.length < want) {
        const q = new URLSearchParams();
        q.set('from', from);
        q.set('to', to);
        q.set('dateField', dateField);
        q.set('top', String(pageSize));
        q.set('skip', String(skip));
        if (assignedTo.trim()) q.set('assignedTo', assignedTo.trim());

        const res = await fetch(`${workItemsUrl}?${q.toString()}`);
        const isJson = (res.headers.get('content-type') || '').includes('application/json');
        const body = isJson ? await res.json() : { error: await res.text() };
        if (!res.ok) throw new Error(body?.error || res.statusText);

        const page = body as AzureListResponse;
        const items = Array.isArray(page.items) ? page.items : [];
        kept.push(...items);

        if (items.length < pageSize) {
          // no more pages
          break;
        }
        skip += items.length;

        // Safety cap to avoid scanning huge datasets accidentally.
        if (skip >= 5000) break;
      }

      setData({ from, to, count: kept.slice(0, want).length, items: kept.slice(0, want) });
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
  const detailChangesetIds = (detail?.changesetIds || []).filter((n) => Number.isFinite(n) && n > 0);

  return (
    <main className="azureTablePage">
      <div className="azureTableHeader">
        <h1 className="pageTitle">Azure (Work Items)</h1>
        <p className="pageSubtitle">
          List work items created or changed in a date range, with an optional assignee filter.
        </p>
      </div>

      <div className="panel azureTableFilters">
        <div
          className="panelInner"
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
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
        <label style={{ display: 'grid', gap: 6, fontSize: 14, width: 120 }}>
          Top
          <input
            type="number"
            min={1}
            max={1000}
            value={top}
            onChange={(e) => setTop(Math.min(Math.max(1, parseInt(e.target.value || '200', 10) || 200), 1000))}
          />
        </label>
        <div className="multiSelect" ref={typeMenuRef}>
          <button
            type="button"
            className="multiSelectButton"
            onClick={() => setTypeMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={typeMenuOpen}
            title="Type filters"
          >
            <span className="multiSelectButtonLabel">
              Type filters ({hiddenTypes.length ? `hidden ${hiddenTypes.length}` : 'showing all'})
            </span>
            <span className="multiSelectChevron" aria-hidden="true">▾</span>
          </button>
          {typeMenuOpen && (
            <div className="multiSelectMenu" role="menu" aria-label="Type filters menu">
              <div className="multiSelectMenuHeader">Hide these work item types from the list:</div>
              {DEFAULT_HIDDEN_TYPES.map((t) => {
                const checked = hiddenTypeSet.has(normType(t));
                return (
                  <label key={t} className="multiSelectOption">
                    <span className="multiSelectOptionLeft">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setHiddenTypes((prev) => {
                            const set = new Set(prev.map(normType));
                            if (on) set.add(normType(t));
                            else set.delete(normType(t));
                            const out: string[] = [];
                            for (const d of DEFAULT_HIDDEN_TYPES) if (set.has(normType(d))) out.push(d);
                            for (const p of prev) {
                              const n = normType(p);
                              if (!set.has(n)) continue;
                              if (out.some((x) => normType(x) === n)) continue;
                              out.push(p);
                            }
                            return out;
                          });
                        }}
                      />
                      <span className="multiSelectOptionLabel">{t}</span>
                    </span>
                  </label>
                );
              })}
              <div className="multiSelectMenuFooter">
                <button type="button" onClick={() => setHiddenTypes([...DEFAULT_HIDDEN_TYPES])}>Reset</button>
                <button type="button" onClick={() => setHiddenTypes([])}>Show all</button>
                <button type="button" onClick={() => setTypeMenuOpen(false)}>Close</button>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={fetchList}
          disabled={loading}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
        {summary && <div className="muted2" style={{ fontSize: 13, paddingBottom: 6 }}>{summary}</div>}
      </div>
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
        <section className="panel azureTableListPanel">
          <div className="panelInner azureTableListInner">
            {data && rows.length > 0 && (
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
                  Showing {clampedPageIdx * pageSize + 1}–{Math.min((clampedPageIdx + 1) * pageSize, rows.length)} of {rows.length}
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
            <div className="azureTableListScroll">
              <table className="stickyTable" style={{ width: '100%', minWidth: 1120, borderCollapse: 'collapse', fontSize: 14 }}>
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
              {pageRows.map((r) => (
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
        </section>
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

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 650, marginBottom: 6 }}>Linked changesets</div>
                    {detailChangesetIds.length === 0 ? (
                      <div className="muted2">—</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {detailChangesetIds.map((cid) => (
                          <button
                            key={cid}
                            type="button"
                            onClick={() => {
                              setCsModalInitialId(cid);
                              setCsModalOpen(true);
                            }}
                            title="Open changeset diff"
                            style={{
                              padding: '8px 10px',
                              borderRadius: 999,
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            }}
                          >
                            #{cid}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setCsModalInitialId(detailChangesetIds[0] ?? null);
                            setCsModalOpen(true);
                          }}
                          title="Open changesets viewer"
                        >
                          Open viewer
                        </button>
                      </div>
                    )}
                  </div>

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

      <ChangesetDiffModal
        open={csModalOpen}
        onClose={() => setCsModalOpen(false)}
        title={detail ? `Work Item #${detail.id} — linked changesets` : 'Linked changesets'}
        linkUrl={detail?.webUrl}
        linkLabel="Open work item in Azure DevOps"
        changesetIds={detailChangesetIds}
        changesetsUrl={changesetsUrl}
        initialChangesetId={csModalInitialId}
      />
    </main>
  );
}

