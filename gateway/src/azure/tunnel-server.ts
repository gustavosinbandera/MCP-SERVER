/**
 * WebSocket server so a local client (with VPN/PAT) can connect to the instance
 * and the instance forwards Azure requests through that channel. No port opening at home.
 *
 * Env: AZURE_TUNNEL_PORT (e.g. 3097) to enable. Optional: AZURE_TUNNEL_SECRET for auth.
 */

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { randomUUID } from 'crypto';

export type AzureFetchResult = { ok: boolean; status: number; statusText: string; text: string; contentType: string };

type Pending = { resolve: (r: AzureFetchResult) => void; reject: (e: Error) => void };

let tunnelPort: number;
let wss: WebSocketServer | null = null;
let currentClient: import('ws').WebSocket | null = null;
const pending = new Map<string, Pending>();
const REQUEST_TIMEOUT_MS = 120000;

function getTunnelPort(): number {
  const v = process.env.AZURE_TUNNEL_PORT || '';
  const n = parseInt(v, 10);
  return v !== '' && Number.isFinite(n) && n > 0 ? n : 0;
}

function getTunnelSecret(): string {
  return (process.env.AZURE_TUNNEL_SECRET || '').trim();
}

function isAuthenticated(conn: { authenticated?: boolean }): boolean {
  const secret = getTunnelSecret();
  return secret === '' || (conn as { authenticated?: boolean }).authenticated === true;
}

export function isTunnelReady(): boolean {
  return currentClient != null && currentClient.readyState === 1 && isAuthenticated(currentClient as any);
}

export function requestViaTunnel(url: string, options: RequestInit = {}): Promise<AzureFetchResult> {
  if (!currentClient || currentClient.readyState !== 1) {
    return Promise.reject(new Error('Azure tunnel not connected'));
  }
  if (!isAuthenticated(currentClient as any)) {
    return Promise.reject(new Error('Azure tunnel not authenticated'));
  }
  const id = randomUUID();
  const method = (options.method || 'GET').toUpperCase();
  const body =
    options.body === undefined || options.body === null
      ? undefined
      : typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body);
  const headers: Record<string, string> = {};
  if (options.headers && typeof options.headers === 'object' && !Array.isArray(options.headers)) {
    const h = options.headers as Record<string, string>;
    for (const [k, v] of Object.entries(h)) if (v !== undefined && k.toLowerCase() !== 'authorization') headers[k] = String(v);
  }
  const payload = {
    type: 'request',
    id,
    url,
    method,
    body,
    headers: Object.keys(headers).length ? headers : undefined,
  };
  return new Promise<AzureFetchResult>((resolve, reject) => {
    const t = setTimeout(() => {
      if (pending.delete(id)) reject(new Error('Azure tunnel request timeout'));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, {
      resolve: (r) => {
        clearTimeout(t);
        resolve(r);
      },
      reject: (e) => {
        clearTimeout(t);
        reject(e);
      },
    });
    const client = currentClient;
  if (!client) {
    clearTimeout(t);
    pending.delete(id);
    reject(new Error('Azure tunnel disconnected'));
    return;
  }
  try {
    client.send(JSON.stringify(payload));
  } catch (err) {
    pending.delete(id);
    clearTimeout(t);
    reject(err instanceof Error ? err : new Error(String(err)));
  }
  });
}

export function startAzureTunnelServer(): void {
  tunnelPort = getTunnelPort();
  if (tunnelPort === 0) return;

  const server = createServer((_req, res) => {
    res.writeHead(400);
    res.end('Azure tunnel WebSocket only');
  });

  wss = new WebSocketServer({ server, path: '/' });

  wss.on('connection', (ws, req) => {
    (ws as any).authenticated = getTunnelSecret() === '';
    if (currentClient && currentClient.readyState === 1) {
      try {
        currentClient.close(1000, 'Replaced by new tunnel client');
      } catch (_) {}
      currentClient = null;
    }
    currentClient = ws;
    const remote = req.socket?.remoteAddress || '?';
    console.log(`[azure-tunnel] client connected from ${remote}`);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'auth' && getTunnelSecret() !== '') {
          (ws as any).authenticated = msg.secret === getTunnelSecret();
          ws.send(JSON.stringify({ type: 'auth_result', ok: (ws as any).authenticated }));
          return;
        }
        if (msg.type === 'response' && typeof msg.id === 'string') {
          const p = pending.get(msg.id);
          if (p) {
            pending.delete(msg.id);
            p.resolve({
              ok: (msg.status || 0) >= 200 && (msg.status || 0) < 300,
              status: msg.status ?? 500,
              statusText: msg.statusText || '',
              text: typeof msg.body === 'string' ? msg.body : (msg.body ? JSON.stringify(msg.body) : ''),
              contentType: typeof msg.contentType === 'string' ? msg.contentType : '',
            });
          }
          return;
        }
        if (msg.type === 'error' && typeof msg.id === 'string') {
          const p = pending.get(msg.id);
          if (p) {
            pending.delete(msg.id);
            p.reject(new Error(typeof msg.message === 'string' ? msg.message : 'Tunnel error'));
          }
          return;
        }
      } catch (_) {
        // ignore parse errors
      }
    });

    ws.on('close', () => {
      if (currentClient === ws) {
        currentClient = null;
        console.log('[azure-tunnel] client disconnected');
        for (const [id, p] of pending) {
          pending.delete(id);
          p.reject(new Error('Azure tunnel disconnected'));
        }
      }
    });

    ws.on('error', () => {
      if (currentClient === ws) currentClient = null;
    });
  });

  server.listen(tunnelPort, '0.0.0.0', () => {
    console.log(`[azure-tunnel] WebSocket server listening on 0.0.0.0:${tunnelPort}`);
  });
}
