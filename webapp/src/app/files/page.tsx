'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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
    <main style={{ fontFamily: 'system-ui', maxWidth: 960, margin: '0 auto', padding: '1rem', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: 8 }}>Explorador de archivos</h1>
      <p style={{ marginBottom: 16, color: '#555' }}>
        Sistema de archivos de la instancia (raíz configurada en el gateway).
      </p>
      <p style={{ marginBottom: 16 }}>
        <Link href="/" style={{ color: '#0066cc' }}>Inicio</Link>
        {' · '}
        <Link href="/upload" style={{ color: '#0066cc' }}>Subir al índice / KB</Link>
      </p>

      {/* Breadcrumb */}
      <nav
        style={{
          padding: '8px 12px',
          background: '#f0f0f0',
          borderRadius: 6,
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
            color: '#0066cc',
            fontWeight: segments.length === 0 ? 600 : 400,
          }}
        >
          📁 Raíz
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
                color: '#0066cc',
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
          padding: '10px 12px',
          background: '#f7f7f7',
          border: '1px solid #e3e3e3',
          borderRadius: 6,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, color: '#333' }}>
          Subir a: <b>{path || 'Raíz'}</b>
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
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid #ccc',
            background: uploading ? '#eee' : '#fff',
            cursor: uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? 'Subiendo…' : 'Subir'}
        </button>
      </div>

      {/* Content */}
      {loading && <p>Cargando…</p>}
      {error && (
        <p style={{ color: '#c00', padding: 12, background: '#fee', borderRadius: 6 }}>{error}</p>
      )}
      {!loading && !error && (
        <div
          style={{
            border: '1px solid #ccc',
            borderRadius: 6,
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', width: 40 }}></th>
                <th style={{ padding: '10px 12px' }}>Nombre</th>
                <th style={{ padding: '10px 12px', width: 100 }}>Tamaño</th>
                <th style={{ padding: '10px 12px', width: 160 }}>Modificado</th>
                <th style={{ padding: '10px 12px', width: 170 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 24, color: '#666' }}>
                    Esta carpeta está vacía.
                  </td>
                </tr>
              )}
              {entries.map((e) => (
                <tr
                  key={e.path}
                  style={{
                    borderTop: '1px solid #eee',
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
                  <td style={{ padding: '8px 12px' }}>
                    {e.isDir ? '📁' : '📄'}
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: e.isDir ? 500 : 400 }}>
                    {e.name}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#666' }}>
                    {e.isDir ? '—' : (e.size != null ? formatSize(e.size) : '—')}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#666' }}>
                    {e.mtime ? formatDate(e.mtime) : '—'}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {!e.isDir ? (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <button
                          type="button"
                          title={`Descargar ${e.name}`}
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
                          style={{
                            padding: '6px 8px',
                            borderRadius: 6,
                            border: '1px solid #bcd7ff',
                            background: '#f3f8ff',
                            color: '#0645ad',
                            cursor: 'pointer',
                          }}
                        >
                          Descargar
                        </button>
                        <button
                          type="button"
                          onClick={async (ev) => {
                            ev.stopPropagation();
                            const ok = confirm(`¿Eliminar "${e.name}"? Esta acción no se puede deshacer.`);
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
                          style={{
                            padding: '6px 8px',
                            borderRadius: 6,
                            border: '1px solid #f3b1b1',
                            background: '#fff5f5',
                            color: '#a00',
                            cursor: 'pointer',
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: '#888' }}>—</span>
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
