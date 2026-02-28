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

  const baseUrl = GATEWAY_URL ? GATEWAY_URL.replace(/\/$/, '') : '';
  const listUrl = baseUrl ? `${baseUrl}/files/list` : '/api/files/list';

  useEffect(() => {
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
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 24, color: '#666' }}>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
