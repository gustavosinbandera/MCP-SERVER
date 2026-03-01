'use client';

import { useState } from 'react';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL;

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ id: string; payload: Record<string, unknown> }[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    setLoading(true);
    try {
      const url = GATEWAY_URL ? `${GATEWAY_URL}/search` : '/api/search';
      const res = await fetch(`${url}?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1 className="pageTitle">Search</h1>
      <p className="pageSubtitle">Search indexed documentation and knowledge base content.</p>

      <div className="panel">
        <div className="panelInner">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 420px' }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                aria-label="Search query"
              />
            </div>
            <button onClick={handleSearch} disabled={loading}>
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            {results.length === 0 && !loading && <p className="muted">No results. Try a different query.</p>}
            {results.map((r) => (
              <article
                key={String(r.id)}
                style={{
                  marginTop: 12,
                  padding: 14,
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  background: 'var(--panel-2)',
                }}
              >
                <div style={{ fontWeight: 700 }}>{(r.payload?.title as string) || 'Untitled'}</div>
                <div className="muted2" style={{ marginTop: 6, fontSize: 14, whiteSpace: 'pre-wrap' }}>
                  {(r.payload?.content as string) || ''}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
