'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import cpp from 'highlight.js/lib/languages/cpp';
import diffLang from 'highlight.js/lib/languages/diff';

hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('diff', diffLang);

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL;

type ChangesetListItem = {
  id: number;
  project: string;
  projectId: 'blueivory' | 'core' | 'unknown';
  author: string;
  createdDate: string;
  comment: string;
  webUrl?: string;
};

type ChangesetsListResponse = {
  count: number;
  items: ChangesetListItem[];
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

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function detectLanguageByPath(p: string): 'cpp' | 'diff' | 'plaintext' {
  const s = String(p || '').toLowerCase();
  if (s.endsWith('.cpp') || s.endsWith('.cc') || s.endsWith('.cxx') || s.endsWith('.h') || s.endsWith('.hpp') || s.endsWith('.hh')) {
    return 'cpp';
  }
  return 'plaintext';
}

export default function AzureChangesetsPage() {
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>(todayIsoDate());
  const [author, setAuthor] = useState('');
  const [project, setProject] = useState<'all' | 'core' | 'blueivory'>('all');
  const [top, setTop] = useState(100);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChangesetsListResponse | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChangesetDetailResponse | null>(null);

  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diff, setDiff] = useState<ChangesetDiffResponse | null>(null);

  const codeBeforeRef = useRef<HTMLElement | null>(null);
  const codeAfterRef = useRef<HTMLElement | null>(null);

  const baseUrl = GATEWAY_URL ? GATEWAY_URL.replace(/\/$/, '') : '';
  const changesetsUrl = baseUrl ? `${baseUrl}/azure/changesets` : '/api/azure/changesets';

  const items = data?.items || [];

  const summary = useMemo(() => {
    if (!data) return '';
    return `${data.count} changeset(s)`;
  }, [data]);

  const fetchList = async (opts?: { auto?: boolean }) => {
    setLoading(true);
    setError(null);
    if (!opts?.auto) setData(null);
    try {
      const q = new URLSearchParams();
      if (project) q.set('project', project);
      if (author.trim()) q.set('author', author.trim());
      if (from.trim()) q.set('from', from.trim());
      if (to.trim()) q.set('to', to.trim());
      q.set('top', String(Math.min(Math.max(1, top || 100), 1000)));
      const url = `${changesetsUrl}?${q.toString()}`;
      const res = await fetch(url);
      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const body = isJson ? await res.json() : { error: await res.text() };
      if (!res.ok) throw new Error(body?.error || res.statusText);
      setData(body as ChangesetsListResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (id: number) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    setDiff(null);
    setDiffError(null);
    try {
      const res = await fetch(`${changesetsUrl}/${id}`);
      const isJson = (res.headers.get('content-type') || '').includes('application/json');
      const body = isJson ? await res.json() : { error: await res.text() };
      if (!res.ok) throw new Error(body?.error || res.statusText);
      setDetail(body as ChangesetDetailResponse);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchDiff = async (id: number, fileIndex: number) => {
    setDiffLoading(true);
    setDiffError(null);
    setDiff(null);
    try {
      const res = await fetch(`${changesetsUrl}/${id}/diff?fileIndex=${encodeURIComponent(String(fileIndex))}`);
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

  // Auto-load latest changesets on first render.
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
      before.className = `hljs language-${lang === 'cpp' ? 'cpp' : 'plaintext'}`;
      hljs.highlightElement(before);
    }
    if (after) {
      after.className = `hljs language-${lang === 'cpp' ? 'cpp' : 'plaintext'}`;
      hljs.highlightElement(after);
    }
  }, [diff]);

  return (
    <main className="changesetsPage">
      <div className="changesetsHeader">
        <h1 className="pageTitle">Azure (Changesets)</h1>
        <p className="pageSubtitle">
          Browse TFVC changesets by date and author. Click a row to inspect file diffs.
        </p>
      </div>

      <div className="panel changesetsFilters">
        <div className="panelInner" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            From (optional)
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            To (optional)
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 14, minWidth: 220 }}>
            Author (optional)
            <input
              type="text"
              value={author}
              placeholder="e.g. John Smith"
              onChange={(e) => setAuthor(e.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            Project
            <select value={project} onChange={(e) => setProject(e.target.value === 'core' ? 'core' : e.target.value === 'blueivory' ? 'blueivory' : 'all')}>
              <option value="all">All</option>
              <option value="core">Core</option>
              <option value="blueivory">BlueIvory</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 14, width: 120 }}>
            Top
            <input
              type="number"
              min={1}
              max={1000}
              value={top}
              onChange={(e) => setTop(Math.min(Math.max(1, parseInt(e.target.value || '100', 10) || 100), 1000))}
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
          <div className="changesetsListScroll" aria-label="Changesets list">
            <div style={{ overflow: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
              <table style={{ width: '100%', minWidth: 1120, borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.06)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px', width: 90 }}>ID</th>
                    <th style={{ padding: '10px 12px', width: 120 }}>Project</th>
                    <th style={{ padding: '10px 12px', width: 220 }}>Author</th>
                    <th style={{ padding: '10px 12px', width: 190 }}>Date</th>
                    <th style={{ padding: '10px 12px' }}>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {!data && !loading && (
                    <tr>
                      <td colSpan={5} style={{ padding: 20, color: 'var(--muted)' }}>
                        Click “Search” to load the latest changesets.
                      </td>
                    </tr>
                  )}
                  {data && items.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: 20, color: 'var(--muted)' }}>
                        No results.
                      </td>
                    </tr>
                  )}
                  {items.map((c) => (
                    <tr
                      key={c.id}
                      style={{ borderTop: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
                      onClick={() => openDetail(c.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          openDetail(c.id);
                        }
                      }}
                      title="Click to view details"
                    >
                      <td style={{ padding: '8px 12px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                        {c.id}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{c.project}</td>
                      <td style={{ padding: '8px 12px' }}>{c.author || '—'}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{formatDate(c.createdDate)}</td>
                      <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.comment || '—'}
                        </span>
                      </td>
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
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>Changeset</div>
                <div style={{ fontSize: 18, fontWeight: 650 }}>
                  {detail ? `#${detail.id} — ${detail.project}` : 'Loading…'}
                </div>
              </div>
              <button type="button" onClick={() => setDetailOpen(false)}>Close</button>
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
                    <div><b>Author</b>: {detail.author || '—'}</div>
                    <div><b>Date</b>: {detail.createdDate ? formatDate(detail.createdDate) : '—'}</div>
                    <div><b>Project</b>: {detail.project}</div>
                    <div><b>Files</b>: {detail.changes?.length || 0}</div>
                  </div>

                  {detail.webUrl && (
                    <p style={{ marginBottom: 12 }}>
                      <a href={detail.webUrl} target="_blank" rel="noreferrer">
                        Open in Azure DevOps
                      </a>
                    </p>
                  )}

                  {detail.comment && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 650, marginBottom: 6 }}>Comment</div>
                      <div className="muted2" style={{ whiteSpace: 'pre-wrap' }}>{detail.comment}</div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 320px) 1fr', gap: 12, alignItems: 'start' }}>
                    <div>
                      <div style={{ fontWeight: 650, marginBottom: 8 }}>Files</div>
                      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel-2)', overflow: 'hidden' }}>
                        <div style={{ maxHeight: 300, overflow: 'auto' }}>
                          {(detail.changes || []).map((c, idx) => (
                            <button
                              key={`${idx}-${c.path}`}
                              type="button"
                              onClick={() => fetchDiff(detail.id, idx)}
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
                    </div>

                    <div>
                      <div style={{ fontWeight: 650, marginBottom: 8 }}>Diff</div>
                      {diffLoading && <p className="muted">Loading diff…</p>}
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
                            <b>File</b>: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>{diff.path}</span>
                          </div>

                          <div className="changesetsDiffGrid">
                            <div className="changesetsDiffPanel">
                              <div className="changesetsDiffTitle">Before</div>
                              <pre>
                                <code ref={codeBeforeRef as any}>{diff.beforeText || ''}</code>
                              </pre>
                            </div>
                            <div className="changesetsDiffPanel">
                              <div className="changesetsDiffTitle">After</div>
                              <pre>
                                <code ref={codeAfterRef as any}>{diff.afterText || ''}</code>
                              </pre>
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

