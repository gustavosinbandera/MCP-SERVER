'use client';

import { useState } from 'react';
import Link from 'next/link';

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
    <main style={{ fontFamily: 'system-ui', maxWidth: 800, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>MCP Knowledge Hub</h1>
      <p>Búsqueda en documentación indexada</p>
      <p style={{ marginBottom: 16 }}>
        <Link href="/upload" style={{ color: '#0066cc' }}>Subir al índice / KB</Link>
        {' · '}
        <Link href="/files" style={{ color: '#0066cc' }}>Explorador de archivos</Link>
        {' · '}
        <Link href="/azure-tasks" style={{ color: '#0066cc' }}>Tareas Azure</Link>
        {' · '}
        <Link href="/mcp-tools" style={{ color: '#0066cc' }}>MCP Tools</Link>
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar..."
          style={{ flex: 1, padding: 8, fontSize: 16 }}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button onClick={handleSearch} disabled={loading} style={{ padding: '8px 16px' }}>
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </div>
      <section>
        {results.length === 0 && !loading && <p>Sin resultados. Prueba con otra búsqueda.</p>}
        {results.map((r) => (
          <article key={String(r.id)} style={{ marginBottom: 16, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
            <strong>{(r.payload?.title as string) || 'Sin título'}</strong>
            <p style={{ margin: '8px 0 0', fontSize: 14 }}>{(r.payload?.content as string) || ''}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
