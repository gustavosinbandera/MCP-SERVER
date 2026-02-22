/**
 * MCP Knowledge Hub - Minimal Gateway
 * Node.js + TypeScript
 * Env: se cargan desde gateway/.env si existe (dotenv).
 */

import 'dotenv/config';
import * as fs from 'fs';
import express from 'express';
import { searchDocs } from './search';
import { getStatsByDay } from './indexing-stats';
import { recordSearchMetric } from './metrics';
import { requireJwt } from './auth/jwt';
import { getOrCreateSession, closeSession } from './mcp/session-manager';
import { runWithLogContext, getLogFilePath, subscribeToLogEntries } from './logger';
import { info as logInfo, warn as logWarn, error as logError } from './logger';

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

// ----- Logs MCP (diagnóstico búsquedas pegadas). Protegido por JWT. -----
const MAX_TAIL = 2000;
function readLogEntries(options: { tail?: number; userId?: string; message?: string }): { entries: Record<string, unknown>[]; path: string } {
  const path = getLogFilePath();
  const tail = Math.min(Math.max(1, options.tail ?? 200), MAX_TAIL);
  const userId = options.userId?.trim();
  const messageSub = options.message?.trim();
  const entries: Record<string, unknown>[] = [];
  if (!fs.existsSync(path)) return { entries, path };
  try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
    const slice = lines.slice(-tail);
    for (const line of slice) {
      if (userId && !line.includes(`"userId":"${userId}"`)) continue;
      if (messageSub && !line.toLowerCase().includes(messageSub.toLowerCase())) continue;
      try {
        entries.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        entries.push({ raw: line });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('readLogEntries failed', { path, err: msg });
  }
  return { entries, path };
}

function logEntryMatchesFilter(entry: Record<string, unknown>, filter: string): boolean {
  if (!filter) return true;
  const msg = String(entry.message ?? '').toLowerCase();
  const level = String(entry.level ?? '').toLowerCase();
  switch (filter) {
    case 'searchDocs':
      return msg.includes('searchdocs');
    case 'tool_search_docs':
      return msg.includes('tool search_docs');
    case 'mcp_post':
      return msg.includes('mcp post');
    case 'error':
      return level === 'error';
    default:
      return true;
  }
}

app.get('/logs', requireJwt, (req, res) => {
  try {
    const tail = req.query.tail != null ? Number(req.query.tail) : 200;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const message = typeof req.query.message === 'string' ? req.query.message : undefined;
    const filter = typeof req.query.filter === 'string' ? req.query.filter : undefined;
    const { entries, path } = readLogEntries({ tail, userId, message });
    const filtered = filter ? entries.filter((e) => logEntryMatchesFilter(e, filter)) : entries;
    res.json({ path, count: filtered.length, entries: filtered });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/** SSE: stream de nuevas entradas de log. Query: filter (searchDocs|tool_search_docs|mcp_post|error|''), tail (entradas iniciales desde archivo). */
app.get('/logs/stream', requireJwt, (req, res) => {
  const filter = typeof req.query.filter === 'string' ? req.query.filter : '';
  const tail = Math.min(Math.max(0, Number(req.query.tail) ?? 50), 500);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const flush = (r: typeof res) => { const f = (r as unknown as { flush?: () => void }).flush; if (typeof f === 'function') f(); };
  const send = (entry: Record<string, unknown>) => {
    if (!logEntryMatchesFilter(entry, filter)) return;
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
    flush(res);
  };
  const { entries } = readLogEntries({ tail });
  const filtered = filter ? entries.filter((e) => logEntryMatchesFilter(e, filter)) : entries;
  filtered.forEach((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
  flush(res);
  const unsub = subscribeToLogEntries(send);
  req.on('close', () => unsub());
});

app.get('/logs/view', requireJwt, (_req, res) => {
  const base = process.env.MCP_LOGS_VIEW_BASE ?? '/api';
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>MCP Logs</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 1rem; background: #1a1a1a; color: #e0e0e0; }
  h1 { font-size: 1.2rem; }
  .toolbar { margin: 1rem 0; display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .toolbar label { display: flex; align-items: center; gap: 0.3rem; }
  select, input, button { padding: 0.4rem 0.8rem; background: #333; color: #e0e0e0; border: 1px solid #555; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  th, td { text-align: left; padding: 0.3rem 0.6rem; border: 1px solid #333; }
  th { background: #333; }
  tr:nth-child(even) { background: #252525; }
  .ts { white-space: nowrap; }
  .msg { max-width: 20rem; overflow: hidden; text-overflow: ellipsis; }
  .err { color: #f88; }
  pre { margin: 0; font-size: 0.8rem; }
  #meta { color: #888; font-size: 0.9rem; }
</style>
</head>
<body>
  <h1>MCP Logs</h1>
  <div class="toolbar">
    <label>Tipo de log
      <select id="filter">
        <option value="">Todos</option>
        <option value="searchDocs">searchDocs</option>
        <option value="tool_search_docs">tool search_docs</option>
        <option value="mcp_post">mcp POST</option>
        <option value="error">Solo errores</option>
      </select>
    </label>
    <label>userId <input type="text" id="userId" placeholder="opcional" style="width:10rem"></label>
    <button type="button" id="btnFetch">Cargar (últimas 200)</button>
    <button type="button" id="btnStream">Stream en vivo (SSE)</button>
    <button type="button" id="btnStop" disabled>Parar stream</button>
  </div>
  <p id="meta"></p>
  <table><thead><tr><th>ts</th><th>level</th><th>userId</th><th>message</th><th>detalle</th></tr></thead><tbody id="t"></tbody></table>
  <script>
    const base = ${JSON.stringify(base)};
    let streamAbort = null;
    function getToken() {
      let t = localStorage.getItem('mcp_id_token') || '';
      if (!t) t = prompt('Pega tu IdToken (Bearer) para ver logs') || '';
      if (t) localStorage.setItem('mcp_id_token', t);
      return t;
    }
    function render(entries) {
      document.getElementById('t').innerHTML = entries.map(e =>
        '<tr><td class="ts">' + (e.ts || '') + '</td><td>' + (e.level || '') + '</td><td>' + (e.userId || '') + '</td><td class="msg">' + (e.message || '') + '</td><td><pre>' + (JSON.stringify(e).slice(0, 200)) + '</pre></td></tr>'
      ).join('');
    }
    document.getElementById('btnFetch').onclick = async () => {
      const token = getToken();
      const filter = document.getElementById('filter').value;
      const userId = document.getElementById('userId').value.trim();
      const q = new URLSearchParams({ tail: '200' });
      if (filter) q.set('filter', filter);
      if (userId) q.set('userId', userId);
      const r = await fetch(base + '/logs?' + q, { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) { document.getElementById('meta').textContent = 'Error ' + r.status; return; }
      const d = await r.json();
      document.getElementById('meta').textContent = d.path + ' — ' + d.count + ' entradas (carga única)';
      render(d.entries);
    };
    document.getElementById('btnStream').onclick = async () => {
      const token = getToken();
      const filter = document.getElementById('filter').value;
      if (streamAbort) streamAbort.abort();
      streamAbort = new AbortController();
      document.getElementById('btnStream').disabled = true;
      document.getElementById('btnStop').disabled = false;
      document.getElementById('meta').textContent = 'Conectando stream SSE…';
      const q = new URLSearchParams({ tail: '50' });
      if (filter) q.set('filter', filter);
      const r = await fetch(base + '/logs/stream?' + q, { headers: { Authorization: 'Bearer ' + token }, signal: streamAbort.signal });
      if (!r.ok) { document.getElementById('meta').textContent = 'Error ' + r.status; document.getElementById('btnStream').disabled = false; document.getElementById('btnStop').disabled = true; return; }
      document.getElementById('meta').textContent = 'Stream en vivo (filtro: ' + (filter || 'todos') + ')';
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\\n\\n");
        buf = lines.pop() || '';
        for (const block of lines) {
          const m = block.match(/^data: (.+)/m);
          if (m) try { const e = JSON.parse(m[1]); document.getElementById('t').insertAdjacentHTML('afterbegin', '<tr><td class="ts">' + (e.ts || '') + '</td><td>' + (e.level || '') + '</td><td>' + (e.userId || '') + '</td><td class="msg">' + (e.message || '') + '</td><td><pre>' + (JSON.stringify(e).slice(0, 200)) + '</pre></td></tr>'); } catch (_) {}
        }
      }
      document.getElementById('btnStream').disabled = false;
      document.getElementById('btnStop').disabled = true;
    };
    document.getElementById('btnStop').onclick = () => { if (streamAbort) streamAbort.abort(); document.getElementById('btnStream').disabled = false; document.getElementById('btnStop').disabled = true; };
  </script>
</body>
</html>`);
});

// Root - service info
app.get('/', (_req, res) => {
  res.json({
    name: 'MCP Knowledge Hub Gateway',
    version: '0.1.0',
    endpoints: { health: '/health', search: '/search?q=...', statsIndexing: '/stats/indexing?days=7', logs: '/logs?tail=200', logsStream: '/logs/stream', logsView: '/logs/view' },
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
  try {
    if (body === undefined || body === null) {
      res.status(400).json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error: body required' } });
      return;
    }
    const result = await getOrCreateSession(userId, sessionId || null);
    const t1 = Date.now();
    if ('error' in result) {
      logWarn('mcp POST error', { userId, method, status: result.status, error: result.error });
      res.status(result.status).json({ error: result.error });
      return;
    }
    const { sessionId: sid, runtime } = result;
    runtime.lastUsedAt = Date.now();
    if (sid !== sessionId) {
      res.setHeader(MCP_SESSION_ID_HEADER, sid);
    }
    const response = await runWithLogContext(
      { userId, sessionId: sid },
      async () => {
        logInfo('mcp POST start', { userId, sessionId: sid, method });
        const out = await runtime.transport.handleRequest(body, { sessionId: sid });
        const t2 = Date.now();
        const total = t2 - t0;
        if (t1 - t0 > 500 || t2 - t1 > 500) {
          logWarn('mcp POST slow', { userId, sessionId: sid, getOrCreateSessionMs: t1 - t0, handleRequestMs: t2 - t1 });
        } else {
          logInfo('mcp POST ok', { userId, sessionId: sid, method, totalMs: total });
        }
        return out;
      }
    );
    if (response === null || response === undefined) {
      res.status(204).send();
    } else {
      res.json(response);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logError('mcp POST error', { userId, sessionId: (req.headers[MCP_SESSION_ID_HEADER] as string)?.trim(), elapsedMs: Date.now() - t0, err: msg, stack });
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
