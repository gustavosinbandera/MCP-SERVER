'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import cpp from 'highlight.js/lib/languages/cpp';
import diffLang from 'highlight.js/lib/languages/diff';
import { diffLines } from 'diff';

hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('diff', diffLang);

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

type ViewMode = 'view' | 'diff';
type ChangeAnchor = { beforeLine: number; afterLine: number };

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
  if (s.endsWith('.cpp') || s.endsWith('.cc') || s.endsWith('.cxx') || s.endsWith('.h') || s.endsWith('.hpp') || s.endsWith('.hh')) return 'cpp';
  return 'plaintext';
}

function isBlockedPath(p: string): boolean {
  return String(p || '').trim().toLowerCase().endsWith('.rc');
}

export function ChangesetDiffModal(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  linkUrl?: string;
  linkLabel?: string;
  topContent?: React.ReactNode;
  changesetIds: number[];
  changesetsUrl: string;
  initialChangesetId?: number | null;
}) {
  const {
    open,
    onClose,
    title,
    linkUrl,
    linkLabel,
    topContent,
    changesetIds,
    changesetsUrl,
    initialChangesetId,
  } = props;

  const [selectedChangesetId, setSelectedChangesetId] = useState<number | null>(null);
  const [csLoading, setCsLoading] = useState(false);
  const [csError, setCsError] = useState<string | null>(null);
  const [csDetail, setCsDetail] = useState<ChangesetDetailResponse | null>(null);

  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diff, setDiff] = useState<ChangesetDiffResponse | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('view');

  const codeBeforeRef = useRef<HTMLElement | null>(null);
  const codeAfterRef = useRef<HTMLElement | null>(null);
  const beforeScrollRef = useRef<HTMLDivElement | null>(null);
  const afterScrollRef = useRef<HTMLDivElement | null>(null);
  const [changeNavIdx, setChangeNavIdx] = useState(0);
  const syncScrollLockRef = useRef<null | 'before' | 'after'>(null);

  useEffect(() => {
    if (!open) return;
    // Initialize selection on open (use explicit initial id or first in list).
    const next = (initialChangesetId && changesetIds.includes(initialChangesetId))
      ? initialChangesetId
      : (changesetIds[0] ?? null);
    setSelectedChangesetId(next);
    setCsDetail(null);
    setCsError(null);
    setDiff(null);
    setDiffError(null);
    setViewMode('view');
    setChangeNavIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openChangeset = async (cid: number) => {
    setSelectedChangesetId(cid);
    setCsLoading(true);
    setCsError(null);
    setCsDetail(null);
    setDiff(null);
    setDiffError(null);
    try {
      const res = await fetch(`${changesetsUrl}/${cid}`);
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

  useEffect(() => {
    if (!open) return;
    if (!selectedChangesetId) return;
    void openChangeset(selectedChangesetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedChangesetId]);

  const fetchDiff = async (changesetId: number, fileIndex: number, tfvcPath: string) => {
    if (isBlockedPath(tfvcPath)) {
      setDiffError('This file type (.rc) is hidden because it is usually huge and can crash the UI.');
      return;
    }
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

  // Highlight code blocks when diff changes (fallback pre>code mode, not the custom renderer).
  useEffect(() => {
    if (!diff) return;
    const lang = detectLanguageByPath(diff.path);
    const before = codeBeforeRef.current;
    const after = codeAfterRef.current;
    if (before) before.className = `hljs language-${lang}`;
    if (after) after.className = `hljs language-${lang}`;
  }, [diff]);

  const diffModel = useMemo(() => {
    if (!diff) return null;
    const beforeText = diff.beforeText || '';
    const afterText = diff.afterText || '';
    const parts = diffLines(beforeText, afterText, { newlineIsToken: false });
    const beforeLines = beforeText.split('\n');
    const afterLines = afterText.split('\n');

    const removedIdx = new Set<number>();
    const addedIdx = new Set<number>();
    const changeAnchorsRaw: Array<{ beforeLine: number; afterLine: number }> = [];
    const ctx = 3;

    let bi = 0;
    let ai = 0;
    for (const p of parts) {
      const val = String(p.value ?? '');
      const n = val === '' ? 0 : val.split('\n').length - (val.endsWith('\n') ? 1 : 0);
      if (p.added) {
        if (n > 0) changeAnchorsRaw.push({ beforeLine: bi, afterLine: ai });
        for (let k = 0; k < n; k++) addedIdx.add(ai + k);
        ai += n;
      } else if (p.removed) {
        if (n > 0) changeAnchorsRaw.push({ beforeLine: bi, afterLine: ai });
        for (let k = 0; k < n; k++) removedIdx.add(bi + k);
        bi += n;
      } else {
        bi += n;
        ai += n;
      }
    }

    const includeBefore = new Set<number>();
    const includeAfter = new Set<number>();
    for (const i of removedIdx) {
      for (let k = Math.max(0, i - ctx); k <= Math.min(beforeLines.length - 1, i + ctx); k++) includeBefore.add(k);
    }
    for (const i of addedIdx) {
      for (let k = Math.max(0, i - ctx); k <= Math.min(afterLines.length - 1, i + ctx); k++) includeAfter.add(k);
    }

    const clampLine = (idx: number, len: number) => {
      if (len <= 0) return 0;
      return Math.min(Math.max(0, idx), len - 1);
    };

    const changeAnchors: ChangeAnchor[] = [];
    for (const a of changeAnchorsRaw) {
      const beforeLine = clampLine(a.beforeLine, beforeLines.length);
      const afterLine = clampLine(a.afterLine, afterLines.length);
      const last = changeAnchors[changeAnchors.length - 1];
      if (last && last.beforeLine === beforeLine && last.afterLine === afterLine) continue;
      changeAnchors.push({ beforeLine, afterLine });
    }

    return {
      lang: detectLanguageByPath(diff.path),
      beforeLines,
      afterLines,
      removedIdx,
      addedIdx,
      includeBefore,
      includeAfter,
      changeAnchors,
    };
  }, [diff]);

  const renderLines = (
    lines: string[],
    opts: { added?: Set<number>; removed?: Set<number>; include?: Set<number>; activeLine?: number }
  ) => {
    const lang = diffModel?.lang === 'cpp' ? 'cpp' : 'plaintext';
    const out: JSX.Element[] = [];
    const include = opts.include;
    const added = opts.added;
    const removed = opts.removed;
    const activeLine = opts.activeLine;
    for (let i = 0; i < lines.length; i++) {
      if (include && !include.has(i)) continue;
      const clsBase = added?.has(i) ? 'codeLine codeLineAdded' : removed?.has(i) ? 'codeLine codeLineRemoved' : 'codeLine';
      const cls = activeLine === i ? `${clsBase} codeLineActive` : clsBase;
      const html = hljs.highlight(lines[i] ?? '', { language: lang }).value || '';
      out.push(
        <span key={i} className={cls} data-line={i}>
          <span className="codeLineGutter">{String(i + 1).padStart(4, ' ')}</span>
          <span className="codeLineText" dangerouslySetInnerHTML={{ __html: html }} />
        </span>
      );
    }
    return <div className="codeLines">{out}</div>;
  };

  const changeCount = diffModel?.changeAnchors?.length ?? 0;

  const activeAnchor = useMemo(() => {
    if (!diffModel || !diffModel.changeAnchors || diffModel.changeAnchors.length === 0) return null;
    const idx = Math.min(Math.max(0, changeNavIdx), diffModel.changeAnchors.length - 1);
    return diffModel.changeAnchors[idx] || null;
  }, [diffModel, changeNavIdx]);

  useEffect(() => {
    if (!diffModel || !diffModel.changeAnchors || diffModel.changeAnchors.length === 0) {
      if (changeNavIdx !== 0) setChangeNavIdx(0);
      return;
    }
    if (changeNavIdx >= diffModel.changeAnchors.length) setChangeNavIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffModel?.changeAnchors?.length]);

  useEffect(() => {
    if (viewMode !== 'view') return;
    if (!activeAnchor) return;
    const scrollTo = (container: HTMLDivElement | null, line: number) => {
      if (!container) return;
      const el = container.querySelector(`[data-line="${line}"]`) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ block: 'center' });
    };
    scrollTo(beforeScrollRef.current, activeAnchor.beforeLine);
    scrollTo(afterScrollRef.current, activeAnchor.afterLine);
  }, [activeAnchor, viewMode]);

  useEffect(() => {
    const before = beforeScrollRef.current;
    const after = afterScrollRef.current;
    if (!before || !after) return;

    const onBefore = () => {
      if (syncScrollLockRef.current === 'after') return;
      syncScrollLockRef.current = 'before';
      after.scrollTop = before.scrollTop;
      after.scrollLeft = before.scrollLeft;
      requestAnimationFrame(() => {
        if (syncScrollLockRef.current === 'before') syncScrollLockRef.current = null;
      });
    };

    const onAfter = () => {
      if (syncScrollLockRef.current === 'before') return;
      syncScrollLockRef.current = 'after';
      before.scrollTop = after.scrollTop;
      before.scrollLeft = after.scrollLeft;
      requestAnimationFrame(() => {
        if (syncScrollLockRef.current === 'after') syncScrollLockRef.current = null;
      });
    };

    before.addEventListener('scroll', onBefore, { passive: true });
    after.addEventListener('scroll', onAfter, { passive: true });
    return () => {
      before.removeEventListener('scroll', onBefore);
      after.removeEventListener('scroll', onAfter);
    };
  }, [diff, viewMode]);

  const jumpChange = (delta: -1 | 1) => {
    if (!diffModel || !diffModel.changeAnchors || diffModel.changeAnchors.length === 0) return;
    const len = diffModel.changeAnchors.length;
    setChangeNavIdx((prev) => (prev + delta + len) % len);
  };

  const fileRows = useMemo(() => {
    const changes = csDetail?.changes || [];
    const out: Array<{ idx: number; path: string; changeType: string; blocked: boolean }> = [];
    for (let i = 0; i < changes.length; i++) {
      const c = changes[i];
      out.push({ idx: i, path: c.path, changeType: c.changeType, blocked: isBlockedPath(c.path) });
    }
    return out;
  }, [csDetail?.changes]);

  const blockedFilesCount = useMemo(() => fileRows.filter((r) => r.blocked).length, [fileRows]);
  const visibleFileRows = useMemo(() => fileRows.filter((r) => !r.blocked), [fileRows]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" onClick={onClose} className="modalOverlay" style={{ zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="modalCard">
        <div className="modalHeader">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>Changesets</div>
            <div style={{ fontSize: 18, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </div>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        <div className="modalBody">
          {topContent}
          {linkUrl && (
            <p style={{ marginBottom: 12 }}>
              <a href={linkUrl} target="_blank" rel="noreferrer">
                {linkLabel || 'Open in Azure DevOps'}
              </a>
            </p>
          )}

          <div className="changesetsModalLayout">
            <div>
              <div style={{ fontWeight: 650, marginBottom: 8 }}>
                Linked changesets ({changesetIds.length})
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--panel-2)', overflow: 'hidden' }}>
                <div style={{ maxHeight: 300, overflow: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
                  {changesetIds.length === 0 ? (
                    <div style={{ padding: 12 }} className="muted2">No linked changesets.</div>
                  ) : (
                    changesetIds.map((cid) => (
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
                      {blockedFilesCount > 0 && (
                        <div className="muted2" style={{ marginTop: 6, fontSize: 12 }}>
                          Hidden {blockedFilesCount} file(s) ending in <b>.rc</b> to prevent UI crashes.
                        </div>
                      )}
                    </div>
                    <div style={{ maxHeight: 240, overflow: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
                      {visibleFileRows.length === 0 ? (
                        <div style={{ padding: 12 }} className="muted2">No visible files to preview.</div>
                      ) : (
                        visibleFileRows.map((c) => (
                          <button
                            key={`${c.idx}-${c.path}`}
                            type="button"
                            onClick={() => fetchDiff(csDetail.id, c.idx, c.path)}
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
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="changesetsDiffArea">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ fontWeight: 650 }}>Code</div>
                  {viewMode === 'view' && changeCount > 0 && (
                    <div className="muted2" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      Change {Math.min(changeNavIdx + 1, changeCount)}/{changeCount}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {viewMode === 'view' && changeCount > 0 && (
                    <div className="changeNav" role="group" aria-label="Navigate changes">
                      <button type="button" onClick={() => jumpChange(-1)} aria-label="Previous change" title="Previous change">
                        ↑
                      </button>
                      <button type="button" onClick={() => jumpChange(1)} aria-label="Next change" title="Next change">
                        ↓
                      </button>
                    </div>
                  )}
                  <div className="segmented" role="tablist" aria-label="View mode">
                    <button type="button" className={viewMode === 'view' ? 'segActive' : ''} onClick={() => setViewMode('view')}>
                      View
                    </button>
                    <button type="button" className={viewMode === 'diff' ? 'segActive' : ''} onClick={() => setViewMode('diff')}>
                      Diff
                    </button>
                  </div>
                </div>
              </div>

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
                      <div className="changesetsCodeScroll" ref={beforeScrollRef}>
                        {diffModel
                          ? renderLines(
                              diffModel.beforeLines,
                              viewMode === 'diff'
                                ? { removed: diffModel.removedIdx, include: diffModel.includeBefore }
                                : { removed: diffModel.removedIdx, activeLine: viewMode === 'view' ? activeAnchor?.beforeLine : undefined }
                            )
                          : (
                            <pre><code ref={codeBeforeRef as any}>{diff.beforeText || ''}</code></pre>
                          )}
                      </div>
                    </div>
                    <div className="changesetsDiffPanel">
                      <div className="changesetsDiffTitle">After</div>
                      <div className="changesetsCodeScroll" ref={afterScrollRef}>
                        {diffModel
                          ? renderLines(
                              diffModel.afterLines,
                              viewMode === 'diff'
                                ? { added: diffModel.addedIdx, include: diffModel.includeAfter }
                                : { added: diffModel.addedIdx, activeLine: viewMode === 'view' ? activeAnchor?.afterLine : undefined }
                            )
                          : (
                            <pre><code ref={codeAfterRef as any}>{diff.afterText || ''}</code></pre>
                          )}
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
        </div>
      </div>
    </div>
  );
}

