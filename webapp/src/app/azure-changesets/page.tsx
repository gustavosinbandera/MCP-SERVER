'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import cpp from 'highlight.js/lib/languages/cpp';
import diffLang from 'highlight.js/lib/languages/diff';

hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('diff', diffLang);

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

type ChangesetDetailResponse = {
  id: number;
  project: string;
  projectId: 'blueivory' | 'core' | 'unknown';
  author: string;
  createdDate: string;
  comment: string;
  webUrl?: string;
  changes: { changeType: string; path: string }[];
};

type ChangesetDiffResponse = {
  id: number;
  fileIndex: number;
  path: string;
  project: string;
  projectId: 'blueivory' | 'core' | 'unknown';
  prevCs: number;
  currentCs: number;
  isNewFile: boolean;
  beforeText: string;
  afterText: string;
  unifiedDiff: string;
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

function detectLanguageByPath(p: string): 'cpp' | 'plaintext' {
  const s = String(p || '').toLowerCase();
  if (s.endsWith('.cpp') || s.endsWith('.cc') || s.endsWith('.cxx') || s.endsWith('.h') || s.endsWith('.hpp') || s.endsWith('.hh')) {
    return 'cpp';
  }
  return 'plaintext';
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

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AzureDetailResponse | null>(null);

  const [selectedChangesetId, setSelectedChangesetId] = useState<number | null>(null);
  const [csLoading, setCsLoading] = useState(false);
  const [csError, setCsError] = useState<string | null>(null);
  const [csDetail, setCsDetail] = useState<ChangesetDetailResponse | null>(null);

  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diff, setDiff] = useState<ChangesetDiffResponse | null>(null);

  const codeBeforeRef = useRef<HTMLElement | null>(null);
  const codeAfterRef = useRef<HTMLElement | null>(null);

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
      return true;
    });
  }, [rows]);

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

  const openWorkItem = async (id: number) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    setSelectedChangesetId(null);
    setCsDetail(null);
    setCsError(null);
    setDiff(null);
    setDiffError(null);
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

  const openChangeset = async (changesetId: number) => {
    setSelectedChangesetId(changesetId);
    setCsLoading(true);
    setCsError(null);
    setCsDetail(null);
    setDiff(null);
    setDiffError(null);
    try {
      const res = await fetch(`${changesetsUrl}/${changesetId}`);
      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const body = isJson ? await res.json() : { error: await res.text() };
      if (!res.ok) throw new Error(body?.error || res.statusText);
      setCsDetail(body as ChangesetDetailResponse);
    } catch (err) {
      setCsError(err instanceof Error ? err.message : String(err));
    } finally {
      setCsLoading(false);
    }
  };

  const fetchDiff = async (changesetId: number, fileIndex: number) => {
    setDiffLoading(true);
    setDiffError(null);
    setDiff(null);
    try {
      const res = await fetch(`${changesetsUrl}/${changesetId}/diff?fileIndex=${encodeURIComponent(String(fileIndex))}`);
      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const body = isJson ? await res.json() : { error: await res.text() };
      if (!res.ok) throw new Error(body?.error || res.statusText);
      setDiff(body as ChangesetDiffResponse);
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiffLoading(false);
    }
  };

  // Auto-load "my recent work items" on first render (same defaults as Azure Tasks).
  useEffect(() => {
    fetchList({ auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Highlight code blocks when diff changes.
  useEffect(() => {
    if (!diff) return;
    const lang = detectLanguageByPath(diff.path);
    const before = codeBeforeRef.current;
    const after = codeAfterRef.current;
    if (before) {
      before.className = `hljs language-${lang}`;
      hljs.highlightElement(before);
    }
    if (after) {
      after.className = `hljs language-${lang}`;
      hljs.highlightElement(after);
    }
  }, [diff]);

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
            <div style={{ overflow: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
              <table style={{ width: '100%', minWidth: 1120, borderCollapse: 'collapse', fontSize: 14 }}>
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
                  {!loading && rowsWithChangesets.map((r) => (
                    <tr
                      key={r.id}
                      style={{ borderTop: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
                      onClick={() => openWorkItem(r.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          openWorkItem(r.id);
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
        </div>
      </section>

      {detailOpen && (
        <div role="dialog" aria-modal="true" onClick={() => setDetailOpen(false)} className="modalOverlay">
          <div onClick={(e) => e.stopPropagation()} className="modalCard">
            <div className="modalHeader">
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>Work Item</div>
                <div style={{ fontSize: 18, fontWeight: 650 }}>
                  {detail ? `#${detail.id} — linked changesets` : 'Loading…'}
                </div>
              </div>
              <button type="button" onClick={() => setDetailOpen(false)}>Close</button>
            </div>
            <div className="modalBody">
              {detailLoading && (
                <p className="spinnerRow" style={{ margin: 0 }}>
                  <span className="spinner" aria-hidden="true" />
                  Loading work item…
                </p>
              )}
              {detailError && (
                <p className="dangerText" style={{ padding: 12, background: 'rgba(255, 107, 107, 0.14)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  {detailError}
                </p>
              )}
              {!detailLoading && detail && (
                <>
                  {detail.webUrl && (
                    <p style={{ marginBottom: 12 }}>
                      <a href={detail.webUrl} target="_blank" rel="noreferrer">
                        Open work item in Azure DevOps
                      </a>
                    </p>
                  )}

                  <div className="changesetsModalLayout">
                    <div>
                      <div style={{ fontWeight: 650, marginBottom: 8 }}>
                        Linked changesets ({detail.changesetIds?.length || 0})
                      </div>
                      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel-2)', overflow: 'hidden' }}>
                        <div style={{ maxHeight: 300, overflow: 'auto' }}>
                          {(detail.changesetIds || []).length === 0 ? (
                            <div style={{ padding: 12 }} className="muted2">No linked changesets.</div>
                          ) : (
                            (detail.changesetIds || []).map((cid) => (
                              <button
                                key={cid}
                                type="button"
                                onClick={() => openChangeset(cid)}
                                style={{
                                  width: '100%',
                                  textAlign: 'left',
                                  border: '0',
                                  borderBottom: '1px solid color-mix(in srgb, var(--border) 65%, transparent)',
                                  background: selectedChangesetId === cid ? 'color-mix(in srgb, var(--brand) 10%, transparent)' : 'transparent',
                                  padding: '10px 10px',
                                  cursor: 'pointer',
                                }}
                              >
                                <div style={{ fontWeight: 750, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                                  #{cid}
                                </div>
                                <div className="muted2" style={{ fontSize: 12 }}>
                                  Open changeset
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontWeight: 650, marginBottom: 8 }}>Files</div>
                        {csLoading && (
                          <p className="spinnerRow" style={{ margin: 0 }}>
                            <span className="spinner spinnerSm" aria-hidden="true" />
                            Loading changeset…
                          </p>
                        )}
                        {csError && (
                          <p className="dangerText" style={{ padding: 12, background: 'rgba(255, 107, 107, 0.14)', borderRadius: 12, border: '1px solid var(--border)' }}>
                            {csError}
                          </p>
                        )}
                        {!csLoading && !csError && csDetail && (
                          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel-2)', overflow: 'hidden' }}>
                            <div style={{ padding: 10, borderBottom: '1px solid color-mix(in srgb, var(--border) 70%, transparent)' }}>
                              <div style={{ fontWeight: 750 }}>Changeset #{csDetail.id}</div>
                              <div className="muted2" style={{ fontSize: 12 }}>
                                {csDetail.author} · {csDetail.createdDate ? formatDate(csDetail.createdDate) : ''}
                              </div>
                              {csDetail.webUrl && (
                                <div style={{ marginTop: 6 }}>
                                  <a href={csDetail.webUrl} target="_blank" rel="noreferrer">Open changeset in Azure DevOps</a>
                                </div>
                              )}
                            </div>
                            <div style={{ maxHeight: 240, overflow: 'auto' }}>
                              {(csDetail.changes || []).map((c, idx) => (
                                <button
                                  key={`${idx}-${c.path}`}
                                  type="button"
                                  onClick={() => fetchDiff(csDetail.id, idx)}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    border: '0',
                                    borderBottom: '1px solid color-mix(in srgb, var(--border) 65%, transparent)',
                                    background: 'transparent',
                                    padding: '10px 10px',
                                    cursor: 'pointer',
                                  }}
                                  title={c.path}
                                >
                                  <div style={{ fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {c.path.split('/').slice(-1)[0] || c.path}
                                  </div>
                                  <div className="muted2" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {c.changeType || 'change'}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="changesetsDiffArea">
                      <div style={{ fontWeight: 650, marginBottom: 8 }}>Diff</div>
                      {diffLoading && (
                        <p className="spinnerRow" style={{ margin: 0 }}>
                          <span className="spinner spinnerSm" aria-hidden="true" />
                          Loading code…
                        </p>
                      )}
                      {diffError && (
                        <p className="dangerText" style={{ padding: 12, background: 'rgba(255, 107, 107, 0.14)', borderRadius: 12, border: '1px solid var(--border)' }}>
                          {diffError}
                        </p>
                      )}
                      {!diffLoading && !diffError && !diff && (
                        <p className="muted">Select a file to view its diff.</p>
                      )}
                      {diff && (
                        <>
                          <div className="muted2" style={{ fontSize: 13, marginBottom: 8 }}>
                            <b>File</b>:{' '}
                            <span className="changesetsFilePath" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                              {diff.path}
                            </span>
                          </div>

                          <div className="changesetsDiffGrid">
                            <div className="changesetsDiffPanel">
                              <div className="changesetsDiffTitle">Before</div>
                              <div className="changesetsCodeScroll">
                                <pre>
                                  <code ref={codeBeforeRef as any}>{diff.beforeText || ''}</code>
                                </pre>
                              </div>
                            </div>
                            <div className="changesetsDiffPanel">
                              <div className="changesetsDiffTitle">After</div>
                              <div className="changesetsCodeScroll">
                                <pre>
                                  <code ref={codeAfterRef as any}>{diff.afterText || ''}</code>
                                </pre>
                              </div>
                            </div>
                          </div>

                          <div style={{ marginTop: 12 }}>
                            <details>
                              <summary className="muted2" style={{ cursor: 'pointer' }}>Show unified diff</summary>
                              <pre style={{ marginTop: 8 }}>
                                <code className="hljs language-diff">{diff.unifiedDiff}</code>
                              </pre>
                            </details>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

