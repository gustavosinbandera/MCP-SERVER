/**
 * MCP Knowledge Hub - Minimal Gateway
 * Node.js + TypeScript
 * Env: se cargan desde gateway/.env si existe (dotenv).
 */

import 'dotenv/config';
import express from 'express';
import { searchDocs } from './search';
import { getStatsByDay } from './indexing-stats';
import { recordSearchMetric } from './metrics';

const app = express();
const PORT = process.env.GATEWAY_PORT || 3001;

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mcp-gateway', timestamp: new Date().toISOString() });
});

// Root - service info
app.get('/', (_req, res) => {
  res.json({
    name: 'MCP Knowledge Hub Gateway',
    version: '0.1.0',
    endpoints: { health: '/health', search: '/search?q=...', statsIndexing: '/stats/indexing?days=7' },
  });
});

// Daily indexing stats (files indexed per day: inbox, shared, url)
app.get('/stats/indexing', (req, res) => {
  try {
    const days = Math.min(Math.max(1, parseInt(String(req.query.days), 10) || 7), 365);
    const byDay = getStatsByDay(days);
    const totalLastNDays = byDay.reduce((sum, d) => sum + d.total, 0);
    res.json({ byDay, totalLastNDays });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// Search - Qdrant integration
app.get('/search', async (req, res) => {
  const startedAt = Date.now();
  try {
    const q = (req.query.q as string) || '';
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const data = await searchDocs(q, limit);
    recordSearchMetric({
      durationMs: Date.now() - startedAt,
      limit,
      queryLength: q.length,
      resultCount: data.results.length,
    });
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MCP Gateway listening on port ${PORT}`);
  });
}

export { app };
