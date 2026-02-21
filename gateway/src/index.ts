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
import { requireJwt } from './auth/jwt';
import { getOrCreateSession, closeSession } from './mcp/session-manager';

// Evitar crashes silenciosos: log y salir para que Docker reinicie el contenedor
process.on('uncaughtException', (err) => {
  console.error('[gateway] uncaughtException', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[gateway] unhandledRejection', reason, promise);
});

const app = express();
const PORT = process.env.GATEWAY_PORT || 3001;

app.use(express.json());

const MCP_SESSION_ID_HEADER = 'mcp-session-id';

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

// ----- MCP over HTTP Streamable (JWT-protected) -----
app.get('/mcp', requireJwt, (_req, res) => {
  res.set('Allow', 'POST, DELETE');
  res.status(405).json({ error: 'Use POST for JSON-RPC messages. Use DELETE with mcp-session-id to close a session.' });
});

app.post('/mcp', requireJwt, async (req, res) => {
  const t0 = Date.now();
  const userId = req.auth!.userId;
  const sessionId = (req.headers[MCP_SESSION_ID_HEADER] as string)?.trim() || undefined;
  const body = req.body;
  const method = body && typeof body === 'object' && 'method' in body ? (body as { method?: string }).method : '?';
  console.warn(`[mcp] POST /mcp userId=${userId} method=${method} sessionId=${sessionId ?? '(new)'}`);
  try {
    if (body === undefined || body === null) {
      res.status(400).json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error: body required' } });
      return;
    }
    const result = await getOrCreateSession(userId, sessionId || null);
    const t1 = Date.now();
    if ('error' in result) {
      console.warn(`[mcp] ${result.status} userId=${userId} method=${method}`, result.error);
      res.status(result.status).json({ error: result.error });
      return;
    }
    const { sessionId: sid, runtime } = result;
    runtime.lastUsedAt = Date.now();
    if (sid !== sessionId) {
      res.setHeader(MCP_SESSION_ID_HEADER, sid);
    }
    const response = await runtime.transport.handleRequest(body, { sessionId: sid });
    const t2 = Date.now();
    const total = t2 - t0;
    if (t1 - t0 > 500 || t2 - t1 > 500) {
      console.warn(`[mcp] slow userId=${userId} getOrCreateSession=${t1 - t0}ms handleRequest=${t2 - t1}ms`);
    } else {
      console.warn(`[mcp] OK method=${method} ${total}ms`);
    }
    if (response === null || response === undefined) {
      res.status(204).send();
    } else {
      res.json(response);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[mcp] POST /mcp error after ${Date.now() - t0}ms:`, msg, stack || '');
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: msg } });
    }
  }
});

app.delete('/mcp', requireJwt, async (req, res) => {
  const userId = req.auth!.userId;
  const sessionId = (req.headers[MCP_SESSION_ID_HEADER] as string)?.trim();
  if (!sessionId) {
    res.status(400).json({ error: 'mcp-session-id header required to close session' });
    return;
  }
  const closed = await closeSession(userId, sessionId);
  res.status(closed ? 204 : 404).send();
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MCP Gateway listening on port ${PORT}`);
    // Warmup: una sesión de prueba para que la primera petición real no pague cold start (JIT, connect).
    getOrCreateSession('_warmup', null)
      .then((r) => {
        if (!('error' in r)) return closeSession('_warmup', r.sessionId);
      })
      .catch((err) => console.warn('[gateway] warmup failed', err));
  });
}

export { app };
