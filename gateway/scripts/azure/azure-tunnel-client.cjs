/**
 * Azure tunnel client: connects from your machine (with VPN/PAT) to the instance WebSocket.
 * The instance then sends Azure requests through this channel. No port opening at home.
 *
 * Env (gateway/.env): AZURE_DEVOPS_PAT, AZURE_TUNNEL_WS_URL (e.g. ws://52.91.217.181:3097).
 * Optional: AZURE_TUNNEL_SECRET (must match instance AZURE_TUNNEL_SECRET).
 *
 * Usage (from gateway/): node scripts/azure/azure-tunnel-client.cjs
 *   or: npm run azure-tunnel
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const WebSocket = require('ws');

const WS_URL = (process.env.AZURE_TUNNEL_WS_URL || '').trim();
const PAT = (process.env.AZURE_DEVOPS_PAT || '').trim();
const SECRET = (process.env.AZURE_TUNNEL_SECRET || '').trim();

function authHeader(pat) {
  return 'Basic ' + Buffer.from(':' + pat, 'utf8').toString('base64');
}

function connect() {
  if (!WS_URL) {
    console.error('AZURE_TUNNEL_WS_URL is required (e.g. ws://52.91.217.181:3097)');
    process.exit(1);
  }
  if (!PAT) {
    console.error('AZURE_DEVOPS_PAT is required in gateway/.env');
    process.exit(1);
  }

  const ws = new WebSocket(WS_URL);
  let authenticated = false;

  ws.on('open', () => {
    console.log('[azure-tunnel] connected to', WS_URL);
    if (SECRET) {
      ws.send(JSON.stringify({ type: 'auth', secret: SECRET }));
    } else {
      authenticated = true;
    }
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'auth_result') {
        authenticated = !!msg.ok;
        if (!authenticated) {
          console.error('[azure-tunnel] auth failed');
          ws.close();
        }
        return;
      }
      if (msg.type === 'request' && msg.id && msg.url) {
        if (!authenticated) {
          ws.send(JSON.stringify({ type: 'error', id: msg.id, message: 'Not authenticated' }));
          return;
        }
        const isDiff = String(msg.url).includes('/tfvc/diffs');
        if (isDiff) console.log('[azure-tunnel] request diff:', msg.url.slice(0, 120) + '...');
        const method = (msg.method || 'GET').toUpperCase();
        const incoming = msg.headers && typeof msg.headers === 'object' ? msg.headers : {};
        const headers = {
          ...incoming,
          Accept: 'application/json, text/plain, */*',
          Authorization: authHeader(PAT),
        };
        try {
          const res = await fetch(msg.url, {
            method,
            headers,
            body: method === 'GET' ? undefined : (msg.body || undefined),
          });
          if (isDiff) console.log('[azure-tunnel] diff response:', res.status, res.statusText);
          const body = await res.text();
          const contentType = res.headers.get('content-type') || '';
          ws.send(
            JSON.stringify({
              type: 'response',
              id: msg.id,
              status: res.status,
              statusText: res.statusText,
              body,
              contentType,
            })
          );
        } catch (err) {
          const message = err && err.message ? err.message : String(err);
          ws.send(JSON.stringify({ type: 'error', id: msg.id, message }));
        }
        return;
      }
    } catch (_) {
      // ignore parse errors
    }
  });

  ws.on('close', (code, reason) => {
    console.log('[azure-tunnel] disconnected', code, reason?.toString() || '');
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => {
    console.error('[azure-tunnel] error', err.message);
  });
}

connect();
