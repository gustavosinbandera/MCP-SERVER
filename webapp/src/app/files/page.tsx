'use client';

import { useState, useEffect } from 'react';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL;

type FileEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  mtime?: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function FilesPage() {
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);

  const baseUrl = GATEWAY_URL ? GATEWAY_URL.replace(/\/$/, '') : '';
  const listUrl = baseUrl ? `${baseUrl}/files/list` : '/api/files/list';
  const uploadUrl = baseUrl ? `${baseUrl}/files/upload` : '/api/files/upload';
  const deleteUrl = baseUrl ? `${baseUrl}/files/delete` : '/api/files/delete';
  const downloadUrl = baseUrl ? `${baseUrl}/files/download` : '/api/files/download';

  const refresh = () => {
    setLoading(true);
    setError(null);
    const q = path ? `?path=${encodeURIComponent(path)}` : '';
    fetch(`${listUrl}${q}`)
      .then((res) => {
        if (!res.ok) return res.json().then((b) => Promise.reject(new Error(b?.error || res.statusText)));
        return res.json();
      })
      .then((data) => setEntries(data.entries || []))
      .catch((err) => {
        setEntries([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, [listUrl, path]);

  const segments = path ? path.split('/').filter(Boolean) : [];
  const goTo = (index: number) => {
    if (index < 0) setPath('');
    else setPath(segments.slice(0, index + 1).join('/'));
  };

  return (
    <main>
      <h1 className="pageTitle">Files</h1>
      <p className="pageSubtitle">Browse and manage the instance filesystem (root configured in the gateway).</p>

      {/* Breadcrumb */}
      <nav
        style={{
          padding: '10px 12px',
          background: 'var(--panel)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          marginBottom: 16,
          fontSize: 14,
        }}
      >
        <button
          type="button"
          onClick={() => goTo(-1)}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            padding: '0 4px',
            color: 'var(--brand)',
            fontWeight: segments.length === 0 ? 600 : 400,
          }}
        >
          📁 Root
        </button>
        {segments.map((seg, i) => (
          <span key={i}>
            <span style={{ margin: '0 6px', color: '#888' }}>/</span>
            <button
              type="button"
              onClick={() => goTo(i)}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                padding: '0 4px',
                color: 'var(--brand)',
                fontWeight: i === segments.length - 1 ? 600 : 400,
              }}
            >
              {seg}
            </button>
          </span>
        ))}
      </nav>

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '12px',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, color: 'var(--text)' }}>
          Upload to: <b>{path || 'Root'}</b>
        </div>
        <input
          type="file"
          multiple
          onChange={(e) => setUploadFiles(e.target.files)}
          style={{ fontSize: 14 }}
        />
        <button
          type="button"
          disabled={uploading || !uploadFiles || uploadFiles.length === 0}
          onClick={async () => {
            if (!uploadFiles || uploadFiles.length === 0) return;
            setUploading(true);
            setError(null);
            try {
              const fd = new FormData();
              for (const f of Array.from(uploadFiles)) fd.append('file', f);
              const q = path ? `?path=${encodeURIComponent(path)}` : '';
              const res = await fetch(`${uploadUrl}${q}`, { method: 'POST', body: fd });
              const isJson = (res.headers.get('content-type') || '').includes('application/json');
              const body = isJson ? await res.json() : { error: await res.text() };
              if (!res.ok || !body?.ok) throw new Error(body?.error || res.statusText);
              setUploadFiles(null);
              refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setUploading(false);
            }
          }}
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>

      {/* Content */}
      {loading && <p className="muted">Loading…</p>}
      {error && (
        <p className="dangerText" style={{ padding: 12, background: 'rgba(255, 107, 107, 0.14)', borderRadius: 12, border: '1px solid var(--border)' }}>{error}</p>
      )}
      {!loading && !error && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
            background: 'var(--panel)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.06)', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>Name</th>
                <th style={{ padding: '10px 12px', width: 110 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={2} style={{ padding: 24, color: 'var(--muted)' }}>
                    This folder is empty.
                  </td>
                </tr>
              )}
              {entries.map((e) => (
                <tr
                  key={e.path}
                  style={{
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                    cursor: e.isDir ? 'pointer' : 'default',
                  }}
                  onClick={() => e.isDir && setPath(e.path)}
                  onKeyDown={(ev) => {
                    if (e.isDir && (ev.key === 'Enter' || ev.key === ' ')) {
                      ev.preventDefault();
                      setPath(e.path);
                    }
                  }}
                  role={e.isDir ? 'button' : undefined}
                  tabIndex={e.isDir ? 0 : undefined}
                >
                  <td style={{ padding: '8px 12px', fontWeight: e.isDir ? 500 : 400 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span aria-hidden="true" style={{ width: 18, textAlign: 'center', flex: '0 0 auto' }}>
                        {e.isDir ? '📁' : '📄'}
                      </span>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={e.name}
                      >
                        {e.name}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {!e.isDir ? (
                      <div className="filesActions">
                        <button
                          type="button"
                          className="filesActionButton"
                          aria-label={`Download ${e.name}`}
                          title={`Download ${e.name}`}
                          onClick={async (ev) => {
                            ev.stopPropagation();
                            setError(null);
                            try {
                              const res = await fetch(`${downloadUrl}?path=${encodeURIComponent(e.path)}`, { method: 'GET' });
                              if (!res.ok) {
                                const isJson = (res.headers.get('content-type') || '').includes('application/json');
                                const body = isJson ? await res.json() : { error: await res.text() };
                                throw new Error(body?.error || res.statusText);
                              }
                              const blob = await res.blob();
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = e.name || 'download';
                              document.body.appendChild(a);
                              a.click();
                              a.remove();
                              window.URL.revokeObjectURL(url);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : String(err));
                            }
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                            <path
                              fill="currentColor"
                              d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4.01 4.01a1 1 0 0 1-1.38 0L7.3 11.71a1 1 0 0 1 1.4-1.42L11 12.59V4a1 1 0 0 1 1-1Zm-7 14a1 1 0 0 1 1 1v2h12v-2a1 1 0 1 1 2 0v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="filesActionButton filesActionDanger"
                          aria-label={`Delete ${e.name}`}
                          title={`Delete ${e.name}`}
                          onClick={async (ev) => {
                            ev.stopPropagation();
                            const ok = confirm(`Delete "${e.name}"? This action cannot be undone.`);
                            if (!ok) return;
                            setError(null);
                            try {
                              const res = await fetch(`${deleteUrl}?path=${encodeURIComponent(e.path)}`, { method: 'DELETE' });
                              const isJson = (res.headers.get('content-type') || '').includes('application/json');
                              const body = isJson ? await res.json() : { error: await res.text() };
                              if (!res.ok || !body?.ok) throw new Error(body?.error || res.statusText);
                              refresh();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : String(err));
                            }
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                            <path
                              fill="currentColor"
                              d="M9 3a1 1 0 0 0-1 1v1H5a1 1 0 1 0 0 2h1v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7h1a1 1 0 1 0 0-2h-3V4a1 1 0 0 0-1-1H9Zm1 2h4v0H10v0Zm-2 2h8v13H8V7Zm2 3a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0v-7a1 1 0 0 1 1-1Zm5 1a1 1 0 1 0-2 0v7a1 1 0 1 0 2 0v-7Z"
                            />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--muted-2)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
