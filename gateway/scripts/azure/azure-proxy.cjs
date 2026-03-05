/**
 * Azure DevOps API proxy for testing when the MCP gateway runs outside the corporate network.
 * Run this on a machine that has VPN access to Azure (e.g. your laptop). The instance gateway
 * is configured with AZURE_DEVOPS_PROXY_URL pointing here and no PAT; this proxy adds the PAT
 * and forwards requests to Azure.
 *
 * Env (gateway/.env or same dir): AZURE_DEVOPS_PAT. Optional: PROXY_SECRET (require X-Proxy-Secret header), PORT (default 3099).
 *
 * Usage: node scripts/azure/azure-proxy.cjs
 * Then on the instance: AZURE_DEVOPS_PROXY_URL=http://YOUR_IP:3099 AZURE_DEVOPS_BASE_URL=... AZURE_DEVOPS_PROJECT=...
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const express = require('express');
const app = express();

const PORT = Math.max(1, parseInt(process.env.PORT || '3099', 10) || 3099);
const PAT = (process.env.AZURE_DEVOPS_PAT || '').trim();
const PROXY_SECRET = (process.env.PROXY_SECRET || '').trim();

function authHeader(pat) {
  return 'Basic ' + Buffer.from(':' + pat, 'utf8').toString('base64');
}

app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ type: '*/*', limit: '10mb' }));

app.post('/forward', async (req, res) => {
  if (PROXY_SECRET && req.headers['x-proxy-secret'] !== PROXY_SECRET) {
    res.status(403).json({ error: 'Invalid or missing X-Proxy-Secret' });
    return;
  }
  const url = req.body?.url || req.headers['x-azure-target-url'];
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing url (body.url or header X-Azure-Target-URL)' });
    return;
  }
  const method = (req.body?.method || 'GET').toUpperCase();
  const body = req.body?.body;
  const customHeaders = req.body?.headers && typeof req.body.headers === 'object' ? req.body.headers : {};

  try {
    const headers = {
      Authorization: authHeader(PAT),
      Accept: 'application/json, text/plain, */*',
      ...customHeaders,
    };
    if (body !== undefined && body !== null && method !== 'GET') {
      if (typeof body === 'string') headers['Content-Type'] = 'application/json';
    }
    const fetchRes = await fetch(url, {
      method,
      headers,
      body: method === 'GET' ? undefined : (typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined),
    });
    const text = await fetchRes.text();
    const contentType = fetchRes.headers.get('content-type') || '';
    res.status(200).json({
      status: fetchRes.status,
      statusText: fetchRes.statusText,
      body: text,
      contentType,
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    res.status(502).json({ error: 'Proxy fetch failed', detail: msg });
  }
});

if (!PAT) {
  console.error('AZURE_DEVOPS_PAT is required. Set it in gateway/.env');
  process.exit(1);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Azure proxy listening on 0.0.0.0:${PORT}`);
  if (PROXY_SECRET) console.log('X-Proxy-Secret required');
});
