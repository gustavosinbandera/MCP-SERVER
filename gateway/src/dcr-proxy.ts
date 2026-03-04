/**
 * DCR proxy: recibe solicitudes de registro OIDC (p. ej. ChatGPT), valida y crea el cliente en Keycloak.
 * Ruta: POST /realms/mcp/clients-registrations/openid-connect
 * Auth: Authorization: Bearer <MCP_DCR_REG_SECRET>
 */
import type { Request, Response } from 'express';

const MCP_DCR_REG_SECRET = (process.env.MCP_DCR_REG_SECRET || '').trim();
const KEYCLOAK_INTERNAL_URL = (process.env.KEYCLOAK_INTERNAL_URL || process.env.KEYCLOAK_PUBLIC_URL || '').trim();
const KEYCLOAK_ADMIN = (process.env.KEYCLOAK_ADMIN || 'admin').trim();
const KEYCLOAK_ADMIN_PASSWORD = (process.env.KEYCLOAK_ADMIN_PASSWORD || '').trim();
const KEYCLOAK_REALM = (process.env.KEYCLOAK_REALM || 'mcp').trim();
const KEYCLOAK_PUBLIC_URL = (process.env.KEYCLOAK_PUBLIC_URL || '').trim();
const MCP_GATEWAY_URL = (process.env.MCP_GATEWAY_URL || '').trim();

/** Prefixes allowed for redirect_uris (one per line or comma-separated). Default allows ChatGPT. */
function getAllowedRedirectPrefixes(): string[] {
  const raw = (process.env.MCP_DCR_ALLOWED_REDIRECT_PREFIXES || 'https://chat.openai.com').trim();
  return raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
}

async function getKeycloakAdminToken(): Promise<string> {
  const base = KEYCLOAK_INTERNAL_URL.replace(/\/$/, '');
  const url = `${base}/realms/master/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: KEYCLOAK_ADMIN,
    password: KEYCLOAK_ADMIN_PASSWORD,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Keycloak admin token failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('No access_token in Keycloak response');
  return data.access_token;
}

function validateRedirectUris(redirect_uris: unknown): string[] {
  if (!Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    throw new Error('redirect_uris required and must be a non-empty array');
  }
  const uris = redirect_uris.map((u) => (typeof u === 'string' ? u : String(u)).trim()).filter(Boolean);
  const allowed = getAllowedRedirectPrefixes();
  for (const uri of uris) {
    if (!uri.startsWith('https://')) throw new Error(`Redirect URI must be HTTPS: ${uri}`);
    const ok = allowed.some((prefix) => uri === prefix || uri.startsWith(prefix + '/'));
    if (!ok) throw new Error(`Redirect URI not allowed: ${uri}. Allowed prefixes: ${allowed.join(', ')}`);
  }
  return uris;
}

export async function handleDcrRegistration(req: Request, res: Response): Promise<void> {
  if (!MCP_DCR_REG_SECRET || !KEYCLOAK_INTERNAL_URL || !KEYCLOAK_ADMIN_PASSWORD) {
    res.status(503).json({ error: 'DCR not configured' });
    return;
  }

  const auth = req.headers.authorization;
  if (!auth || typeof auth !== 'string') {
    res.status(401).setHeader('WWW-Authenticate', 'Bearer').json({ error: 'Missing Authorization' });
    return;
  }
  const match = auth.match(/^\s*Bearer\s+(.+)$/i);
  if (!match || match[1].trim() !== MCP_DCR_REG_SECRET) {
    res.status(401).setHeader('WWW-Authenticate', 'Bearer').json({ error: 'Invalid registration token' });
    return;
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'JSON body required' });
    return;
  }

  let redirect_uris: string[];
  try {
    redirect_uris = validateRedirectUris(body.redirect_uris);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: msg });
    return;
  }

  const client_name = (typeof body.client_name === 'string' ? body.client_name : body.client_id) || 'mcp-oauth-client';
  const scope = (typeof body.scope === 'string' ? body.scope : 'openid') || 'openid';
  const client_id = typeof body.client_id === 'string' && body.client_id.trim()
    ? body.client_id.trim()
    : `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  let adminToken: string;
  try {
    adminToken = await getKeycloakAdminToken();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'Failed to get Keycloak admin token', detail: msg });
    return;
  }

  const base = KEYCLOAK_INTERNAL_URL.replace(/\/$/, '');
  const createUrl = `${base}/admin/realms/${KEYCLOAK_REALM}/clients`;
  const keycloakClient = {
    clientId: client_id,
    name: client_name,
    enabled: true,
    publicClient: true,
    redirectUris: redirect_uris,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: true,
    protocol: 'openid-connect',
    attributes: {
      'pkce.code.challenge.method': 'S256',
    },
  };

  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(keycloakClient),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    res.status(createRes.status).json({
      error: 'Keycloak client creation failed',
      detail: text,
    });
    return;
  }

  const registrationClientUri = KEYCLOAK_PUBLIC_URL
    ? `${KEYCLOAK_PUBLIC_URL}/realms/${KEYCLOAK_REALM}/clients-registrations/openid-connect/${client_id}`
    : '';

  const dcrResponse = {
    client_id,
    client_secret: undefined as string | undefined,
    redirect_uris,
    client_name,
    scope,
    registration_client_uri: registrationClientUri || undefined,
    registration_access_token: undefined as string | undefined,
  };

  res.status(201).json(dcrResponse);
}
