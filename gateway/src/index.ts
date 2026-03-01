/**
 * MCP Knowledge Hub - Minimal Gateway
 * Node.js + TypeScript
 * Env: se cargan desde gateway/.env si existe (dotenv).
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import express from 'express';
import multer from 'multer';
import { getInboxPath, getFilesExplorerRoot, MAX_FILE_SIZE_BYTES, MAX_UPLOAD_FILES, MAX_UPLOAD_TOTAL_BYTES } from './config';
import { isAllowedExtension, isMdExtension, sanitizeUploadPath, validateFileSize } from './inbox-upload';
import { insertKbUpload } from './kb-uploads-db';
import { writeUploadedKbDoc } from './user-kb';
import { searchDocs } from './search';
import { getStatsByDay } from './indexing-stats';
import { recordSearchMetric } from './metrics';
import { requireJwt } from './auth/jwt';
import { hasAzureDevOpsConfig, listWorkItemsByDateRange, getWorkItemWithRelations, extractChangesetIds } from './azure';
import { getOrCreateSession, closeSession } from './mcp/session-manager';
import { enqueueAndWait, clearSessionQueue } from './mcp/session-queue';
import { getMcpToolByName, getMcpToolsCatalog } from './mcp/tools-catalog';
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

// CORS: allow webapp on another port (e.g. 3000) to call this gateway (e.g. 3001)
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

const MCP_SESSION_ID_HEADER = 'mcp-session-id';

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mcp-gateway', timestamp: new Date().toISOString() });
});

// ----- MCP logs (debugging stuck searches). Protected by JWT. -----
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

// Unauthenticated HTML page: token is requested client-side when using Fetch/Stream
// (GET /logs and /logs/stream require JWT).
// base '' = local (no proxy). In production behind nginx under /api, set MCP_LOGS_VIEW_BASE=/api (e.g. in docker-compose).
app.get('/logs/view', (_req, res) => {
  const base = process.env.MCP_LOGS_VIEW_BASE ?? '';
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
    <label>Log type
      <select id="filter">
        <option value="">All</option>
        <option value="searchDocs">searchDocs</option>
        <option value="tool_search_docs">tool search_docs</option>
        <option value="mcp_post">mcp POST</option>
        <option value="error">Errors only</option>
      </select>
    </label>
    <label>userId <input type="text" id="userId" placeholder="optional" style="width:10rem"></label>
    <button type="button" id="btnFetch">Fetch (last 200)</button>
    <button type="button" id="btnStream">Live stream (SSE)</button>
    <button type="button" id="btnStop" disabled>Stop stream</button>
  </div>
  <p id="meta"></p>
  <table><thead><tr><th>ts</th><th>level</th><th>userId</th><th>message</th><th>details</th></tr></thead><tbody id="t"></tbody></table>
  <script>
    const base = ${JSON.stringify(base)};
    let streamAbort = null;
    (function() {
      var params = new URLSearchParams(location.search);
      var t = params.get('token');
      if (t) {
        localStorage.setItem('mcp_id_token', t);
        params.delete('token');
        var clean = location.pathname + (params.toString() ? '?' + params.toString() : '');
        history.replaceState(null, '', clean);
      }
    })();
    function getToken() {
      let t = localStorage.getItem('mcp_id_token') || '';
      if (!t) t = prompt('Paste your IdToken (Bearer) to view logs') || '';
      if (t) localStorage.setItem('mcp_id_token', t);
      return t;
    }
    function render(entries) {
      document.getElementById('t').innerHTML = entries.map(e =>
        '<tr><td class="ts">' + (e.ts || '') + '</td><td>' + (e.level || '') + '</td><td>' + (e.userId || '') + '</td><td class="msg">' + (e.message || '') + '</td><td><pre>' + (JSON.stringify(e).slice(0, 200)) + '</pre></td></tr>'
      ).join('');
    }
    async function fetchLogs(url, opts) {
      let r = await fetch(url, opts);
      if (r.status === 404 && url.indexOf('/api/') !== -1) {
        const fallback = (typeof location !== 'undefined' && location.origin ? location.origin : '') + url.replace(/^\\/api/, '/');
        r = await fetch(fallback, opts);
      }
      return r;
    }
    document.getElementById('btnFetch').onclick = async () => {
      const token = getToken();
      const filter = document.getElementById('filter').value;
      const userId = document.getElementById('userId').value.trim();
      const q = new URLSearchParams({ tail: '200' });
      if (filter) q.set('filter', filter);
      if (userId) q.set('userId', userId);
      const r = await fetchLogs(base + '/logs?' + q, { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) { document.getElementById('meta').textContent = 'Error ' + r.status; return; }
      const d = await r.json();
      document.getElementById('meta').textContent = d.path + ' — ' + d.count + ' entries (one-time fetch)';
      render(d.entries);
    };
    document.getElementById('btnStream').onclick = async () => {
      const token = getToken();
      const filter = document.getElementById('filter').value;
      if (streamAbort) streamAbort.abort();
      streamAbort = new AbortController();
      document.getElementById('btnStream').disabled = true;
      document.getElementById('btnStop').disabled = false;
      document.getElementById('meta').textContent = 'Connecting SSE stream…';
      try {
        const q = new URLSearchParams({ tail: '50' });
        if (filter) q.set('filter', filter);
        const r = await fetchLogs(base + '/logs/stream?' + q, { headers: { Authorization: 'Bearer ' + token }, signal: streamAbort.signal });
        if (!r.ok) { document.getElementById('meta').textContent = 'Error ' + r.status; document.getElementById('btnStream').disabled = false; document.getElementById('btnStop').disabled = true; return; }
        document.getElementById('meta').textContent = 'Live stream (filter: ' + (filter || 'all') + ')';
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split(String.fromCharCode(10) + String.fromCharCode(10));
          buf = parts.pop() || '';
          for (const block of parts) {
            const m = block.match(/^data: (.+)/m);
            if (m) try { const e = JSON.parse(m[1]); document.getElementById('t').insertAdjacentHTML('afterbegin', '<tr><td class="ts">' + (e.ts || '') + '</td><td>' + (e.level || '') + '</td><td>' + (e.userId || '') + '</td><td class="msg">' + (e.message || '') + '</td><td><pre>' + (JSON.stringify(e).slice(0, 200)) + '</pre></td></tr>'); } catch (_) {}
          }
        }
      } catch (err) {
        document.getElementById('meta').textContent = 'Error: ' + (err && err.message ? err.message : String(err));
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
    endpoints: { health: '/health', search: '/search?q=...', statsIndexing: '/stats/indexing?days=7', logs: '/logs?tail=200', logsStream: '/logs/stream', logsView: '/logs/view', filesList: '/files/list?path=...' },
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

function formatIdentity(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const any = v as { displayName?: unknown; uniqueName?: unknown; name?: unknown };
    const displayName = typeof any.displayName === 'string' ? any.displayName : '';
    const uniqueName = typeof any.uniqueName === 'string' ? any.uniqueName : '';
    const name = typeof any.name === 'string' ? any.name : '';
    return displayName || name || uniqueName || '';
  }
  return String(v);
}

function parseDateOnly(dateOnly: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOnly).trim());
  if (!m) return null;
  // Devolvemos exactamente YYYY-MM-DD porque Azure DevOps Server (WIQL) puede fallar
  // if a time is supplied when the field uses day precision.
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function getAzureWorkItemWebUrl(id: number): string | undefined {
  const base = (process.env.AZURE_DEVOPS_BASE_URL || '').trim().replace(/\/+$/g, '');
  const project = (process.env.AZURE_DEVOPS_PROJECT || '').trim();
  if (!base || !project) return undefined;
  return `${base}/${encodeURIComponent(project)}/_workitems/edit/${id}`;
}

// ----- Azure DevOps: Work items (REST for webapp) -----
app.get('/azure/work-items', async (req, res) => {
  try {
    if (!hasAzureDevOpsConfig()) {
      res.status(400).json({ error: 'Azure DevOps is not configured (AZURE_DEVOPS_BASE_URL/PROJECT/PAT).' });
      return;
    }
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    const assignedTo = typeof req.query.assignedTo === 'string' ? req.query.assignedTo : '';
    const dateField = req.query.dateField === 'changed' ? 'changed' : 'created';
    const top = Math.min(Math.max(1, parseInt(String(req.query.top || '50'), 10) || 50), 200);
    const skip = Math.max(0, parseInt(String(req.query.skip || '0'), 10) || 0);
    const fromDate = parseDateOnly(from);
    const toDate = parseDateOnly(to);
    if (!fromDate || !toDate) {
      res.status(400).json({ error: 'Invalid parameters. Use from/to as YYYY-MM-DD.' });
      return;
    }
    const items = await listWorkItemsByDateRange({
      fromDate,
      toDate,
      assignedTo: assignedTo.trim() ? assignedTo.trim() : undefined,
      assignedToMe: false,
      dateField,
      top,
      skip,
    });
    const mapped = (items || []).map((wi) => {
      const f = wi.fields || {};
      return {
        id: wi.id,
        title: String(f['System.Title'] ?? ''),
        state: String(f['System.State'] ?? ''),
        type: String(f['System.WorkItemType'] ?? ''),
        assignedTo: formatIdentity(f['System.AssignedTo']),
        createdBy: formatIdentity(f['System.CreatedBy']),
        createdDate: String(f['System.CreatedDate'] ?? ''),
        changedDate: String(f['System.ChangedDate'] ?? ''),
        areaPath: String(f['System.AreaPath'] ?? ''),
        webUrl: getAzureWorkItemWebUrl(wi.id),
      };
    });
    res.json({ from: fromDate, to: toDate, count: mapped.length, items: mapped });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.get('/azure/work-items/:id', async (req, res) => {
  try {
    if (!hasAzureDevOpsConfig()) {
      res.status(400).json({ error: 'Azure DevOps is not configured (AZURE_DEVOPS_BASE_URL/PROJECT/PAT).' });
      return;
    }
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid ID' });
      return;
    }
    const wi = await getWorkItemWithRelations(id);
    const changesetIds = extractChangesetIds(wi);
    res.json({
      id,
      webUrl: getAzureWorkItemWebUrl(id),
      fields: wi.fields || {},
      relations: wi.relations || [],
      changesetIds,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ----- File explorer (list directory contents; path is relative to FILES_EXPLORER_ROOT) -----
function resolveExplorerPath(relativePath: string): { fullPath: string; relativePath: string } | null {
  const root = getFilesExplorerRoot();
  const normalizedRoot = path.normalize(root);
  const joined = path.join(root, relativePath || '.');
  const fullPath = path.normalize(joined);
  if (!fullPath.startsWith(normalizedRoot) && fullPath !== normalizedRoot) return null;
  const relative = path.relative(root, fullPath).replace(/\\/g, '/') || '.';
  return { fullPath, relativePath: relative };
}

app.get('/files/list', (req, res) => {
  try {
    const rawPath = (req.query.path as string) || '';
    const resolved = resolveExplorerPath(rawPath);
    if (!resolved) {
      res.status(400).json({ error: 'Path outside allowed root' });
      return;
    }
    const { fullPath, relativePath } = resolved;
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Path not found' });
      return;
    }
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) {
      res.status(400).json({ error: 'Not a directory' });
      return;
    }
    const root = getFilesExplorerRoot();
    const entries = fs.readdirSync(fullPath, { withFileTypes: true }).map((d) => {
      const full = path.join(fullPath, d.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      const st = fs.statSync(full);
      return {
        name: d.name,
        path: rel,
        isDir: st.isDirectory(),
        size: st.isFile() ? st.size : undefined,
        mtime: st.mtime ? st.mtime.toISOString() : undefined,
      };
    });
    // Folders first, then files; sort each group alphabetically
    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    res.json({ root: '.', path: relativePath, entries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ----- File explorer download (single file) -----
app.get('/files/download', (req, res) => {
  try {
    const rawPath = (req.query.path as string) || '';
    const resolved = resolveExplorerPath(rawPath);
    if (!resolved) {
      res.status(400).json({ error: 'Path outside allowed root' });
      return;
    }
    const { fullPath } = resolved;
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Path not found' });
      return;
    }
    const st = fs.statSync(fullPath);
    if (!st.isFile()) {
      res.status(400).json({ error: 'Not a file' });
      return;
    }

    const baseName = path.basename(fullPath);
    // Evitar descargas accidentales de secretos comunes (especialmente en instancia).
    const lower = baseName.toLowerCase();
    const isSensitive =
      lower === '.env' ||
      lower.startsWith('.env.') ||
      lower.endsWith('.pem') ||
      lower.endsWith('.key') ||
      lower.endsWith('.pfx') ||
      lower.endsWith('.p12') ||
      lower.endsWith('.kdbx') ||
      lower === 'id_rsa' ||
      lower === 'id_ed25519' ||
      lower.endsWith('.sqlite') ||
      lower.endsWith('.db');
    if (isSensitive) {
      res.status(403).json({ error: 'File is blocked for download' });
      return;
    }

    res.download(fullPath, baseName, { dotfiles: 'allow' }, (err) => {
      if (!err) return;
      if (res.headersSent) return;
      const anyErr = err as unknown as { status?: number; statusCode?: number; message?: string };
      const status = anyErr.statusCode || anyErr.status || 500;
      res.status(status).json({ error: status === 404 ? 'Path not found' : (anyErr.message || 'Download failed') });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ----- File explorer upload (multipart) -----
const uploadExplorer = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_UPLOAD_FILES },
});

app.post('/files/upload', uploadExplorer.array('file', MAX_UPLOAD_FILES), (req, res) => {
  try {
    const rawDir = (req.query.path as string) || '';
    const dirResolved = resolveExplorerPath(rawDir);
    if (!dirResolved) {
      res.status(400).json({ ok: false, error: 'Path outside allowed root' });
      return;
    }
    const { fullPath: dirFullPath, relativePath: dirRelative } = dirResolved;
    if (!fs.existsSync(dirFullPath)) {
      res.status(404).json({ ok: false, error: 'Path not found' });
      return;
    }
    const dirStat = fs.statSync(dirFullPath);
    if (!dirStat.isDirectory()) {
      res.status(400).json({ ok: false, error: 'Not a directory' });
      return;
    }

    const files = (req.files as Express.Multer.File[]) || [];
    const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
    if (totalSize > MAX_UPLOAD_TOTAL_BYTES) {
      res.status(400).json({ ok: false, error: `Total size exceeds ${MAX_UPLOAD_TOTAL_BYTES} bytes` });
      return;
    }

    const written: string[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const file of files) {
      const original = file.originalname || 'file';
      if (!isAllowedExtension(original)) {
        skipped.push({ name: original, reason: 'Extension not allowed' });
        continue;
      }
      if (!validateFileSize(file.size)) {
        skipped.push({ name: original, reason: `File too large (max ${MAX_FILE_SIZE_BYTES} bytes)` });
        continue;
      }
      const safeName = sanitizeUploadPath(path.basename(original)) || original.replace(/[<>:"|?*\x00-\x1f]/g, '_') || 'file';
      const destPath = path.join(dirFullPath, safeName);
      fs.writeFileSync(destPath, file.buffer);
      written.push(path.join(dirRelative === '.' ? '' : dirRelative, safeName).replace(/\\/g, '/'));
    }

    res.json({ ok: true, path: dirRelative, writtenCount: written.length, written, skippedCount: skipped.length, skipped });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
});

// ----- File explorer delete (file or empty directory) -----
app.delete('/files/delete', (req, res) => {
  try {
    const rawPath = (req.query.path as string) || '';
    const resolved = resolveExplorerPath(rawPath);
    if (!resolved) {
      res.status(400).json({ ok: false, error: 'Path outside allowed root' });
      return;
    }
    const { fullPath, relativePath } = resolved;
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ ok: false, error: 'Path not found' });
      return;
    }
    const st = fs.statSync(fullPath);
    if (st.isFile()) {
      fs.unlinkSync(fullPath);
      res.json({ ok: true, deleted: relativePath });
      return;
    }
    if (st.isDirectory()) {
      const items = fs.readdirSync(fullPath);
      if (items.length > 0) {
        res.status(400).json({ ok: false, error: 'Directory not empty' });
        return;
      }
      fs.rmdirSync(fullPath);
      res.json({ ok: true, deleted: relativePath });
      return;
    }
    res.status(400).json({ ok: false, error: 'Unsupported file type' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
});

// ----- Inbox upload (multipart) -----
const uploadInbox = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_UPLOAD_FILES },
});

app.post('/inbox/upload', uploadInbox.array('file', MAX_UPLOAD_FILES), (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    const projectRaw = (req.body && typeof req.body.project === 'string' ? req.body.project : '').trim();
    const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
    if (totalSize > MAX_UPLOAD_TOTAL_BYTES) {
      res.status(400).json({ ok: false, error: `Total size exceeds ${MAX_UPLOAD_TOTAL_BYTES} bytes` });
      return;
    }
    const inboxDir = getInboxPath();
    const subdir = projectRaw
      ? sanitizeUploadPath(projectRaw) || `upload-${randomUUID().slice(0, 8)}`
      : `upload-${randomUUID().slice(0, 8)}`;
    const destDir = path.join(inboxDir, subdir);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const paths: string[] = [];
    for (const file of files) {
      const name = file.originalname || 'file';
      if (!isAllowedExtension(name)) continue;
      if (!validateFileSize(file.size)) continue;
      const safeName = sanitizeUploadPath(path.basename(name)) || name.replace(/[<>:"|?*\x00-\x1f]/g, '_') || 'file';
      const destPath = path.join(destDir, safeName);
      fs.writeFileSync(destPath, file.buffer, 'utf-8');
      paths.push(path.join(subdir, safeName).replace(/\\/g, '/'));
    }
    res.json({ ok: true, written: paths.length, paths });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
});

// ----- KB upload (multipart, .md only) -----
const uploadKb = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_UPLOAD_FILES },
});

app.post('/kb/upload', uploadKb.array('file', MAX_UPLOAD_FILES), (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    const userId = (req.body && typeof req.body.userId === 'string' ? req.body.userId : '').trim() || 'local';
    const project = (req.body && typeof req.body.project === 'string' ? req.body.project : '').trim() || '';
    const source = (req.body && typeof req.body.source === 'string' ? req.body.source : '').trim() || undefined;
    const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0);
    if (totalSize > MAX_UPLOAD_TOTAL_BYTES) {
      res.status(400).json({ ok: false, error: `Total size exceeds ${MAX_UPLOAD_TOTAL_BYTES} bytes` });
      return;
    }
    const paths: string[] = [];
    for (const file of files) {
      const name = file.originalname || 'file.md';
      if (!isMdExtension(name)) continue;
      if (!validateFileSize(file.size)) continue;
      const content = file.buffer.toString('utf-8');
      const result = writeUploadedKbDoc({
        userId,
        originalFilename: name,
        content,
        project,
        source,
      });
      if (result.error) {
        res.status(500).json({ ok: false, error: result.error });
        return;
      }
      insertKbUpload({ userId, project, filePath: result.relativePath, source });
      paths.push(result.relativePath);
    }
    res.json({ ok: true, written: paths.length, paths });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }
});

// ----- MCP over HTTP Streamable (JWT-protected) -----
app.get('/mcp', requireJwt, (_req, res) => {
  res.set('Allow', 'POST, DELETE');
  res.status(405).json({ error: 'Use POST for JSON-RPC messages. Use DELETE with mcp-session-id to close a session.' });
});

// ----- MCP Tools catalog (public help for webapp) -----
app.get('/mcp/tools', (_req, res) => {
  const tools = getMcpToolsCatalog();
  res.json({ count: tools.length, tools });
});

app.get('/mcp/tools/:name', (req, res) => {
  const name = String(req.params.name || '').trim();
  const tool = getMcpToolByName(name);
  if (!tool) {
    res.status(404).json({ error: `Tool not found: ${name}` });
    return;
  }
  res.json(tool);
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
    const requestId =
      body != null && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'id')
        ? (body as { id?: string | number }).id
        : undefined;
    const response = await runWithLogContext(
      { userId, sessionId: sid },
      async () => {
        logInfo('mcp POST start', { userId, sessionId: sid, method, requestId });
        const { result: out, handleRequestStartedAt } = await enqueueAndWait(userId, sid, runtime, body, t0);
        const t2 = Date.now();
        const total = t2 - t0;
        const handleRequestMs = t2 - handleRequestStartedAt;
        const slowMs = Number(process.env.MCP_SLOW_MS) || 500;
        if (t1 - t0 > slowMs || handleRequestMs > slowMs) {
          logWarn('mcp POST slow', {
            userId,
            sessionId: sid,
            method,
            requestId,
            getOrCreateSessionMs: t1 - t0,
            handleRequestMs,
            totalMs: total,
          });
        } else {
          logInfo('mcp POST ok', { userId, sessionId: sid, method, requestId, totalMs: total });
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
  clearSessionQueue(userId, sessionId);
  const closed = await closeSession(userId, sessionId);
  res.status(closed ? 204 : 404).send();
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MCP Gateway listening on port ${PORT}`);
    logInfo('Gateway started', { port: PORT, path: getLogFilePath() });
    // Warmup: a test session so the first real request doesn't pay cold start (JIT, connect).
    getOrCreateSession('_warmup', null)
      .then((r) => {
        if (!('error' in r)) return closeSession('_warmup', r.sessionId);
      })
      .catch((err) => console.warn('[gateway] warmup failed', err));
  });
}

export { app };
