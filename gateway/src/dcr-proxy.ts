/**
 * DCR proxy: registro dinámico de clientes OIDC (ChatGPT). Sin auth Bearer: seguridad por allowlist de redirect_uris.
 * Ruta: POST /realms/mcp/clients-registrations/openid-connect
 */
import type { Request, Response } from 'express';

const KEYCLOAK_INTERNAL_URL = (process.env.KEYCLOAK_INTERNAL_URL || process.env.KEYCLOAK_PUBLIC_URL || '').trim();
const KEYCLOAK_ADMIN = (process.env.KEYCLOAK_ADMIN || 'admin').trim();
const KEYCLOAK_ADMIN_PASSWORD = (process.env.KEYCLOAK_ADMIN_PASSWORD || '').trim();
const KEYCLOAK_REALM = (process.env.KEYCLOAK_REALM || 'mcp').trim();
const KEYCLOAK_PUBLIC_URL = (process.env.KEYCLOAK_PUBLIC_URL || '').trim();

function parsePrefixes(v?: string): string[] {
  return (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedRedirect(uri: string, allowed: string[]): boolean {
  return allowed.some((a) => (a.endsWith('/') ? uri.startsWith(a) : uri === a));
}

function getAllowedRedirectPrefixes(): string[] {
  const raw = (process.env.MCP_DCR_ALLOWED_REDIRECT_PREFIXES || 'https://chatgpt.com/connector/oauth/,https://chatgpt.com/connector_platform_oauth_redirect').trim();
  return parsePrefixes(raw);
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

export async function handleDcrRegistration(req: Request, res: Response): Promise<void> {
  if (!KEYCLOAK_INTERNAL_URL || !KEYCLOAK_ADMIN_PASSWORD) {
    res.status(503).json({ error: 'DCR not configured' });
    return;
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'JSON body required' });
    return;
  }

  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
    res.status(400).json({ error: 'missing_redirect_uris' });
    return;
  }

  const allowed = getAllowedRedirectPrefixes();
  const redirect_uris: string[] = [];
  for (const uri of body.redirect_uris) {
    if (typeof uri !== 'string' || !uri.startsWith('https://')) {
      res.status(400).json({ error: 'redirect_uri_must_be_https', uri: String(uri) });
      return;
    }
    if (!isAllowedRedirect(uri, allowed)) {
      res.status(400).json({ error: 'redirect_uri_not_allowed', uri });
      return;
    }
    redirect_uris.push(uri.trim());
  }

  const grantTypes = Array.isArray(body.grant_types) ? body.grant_types : [];
  if (grantTypes.length !== 1 || grantTypes[0] !== 'authorization_code') {
    res.status(400).json({ error: 'invalid_grant_types', grant_types: grantTypes });
    return;
  }

  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none') {
    res.status(400).json({ error: 'invalid_token_endpoint_auth_method' });
    return;
  }

  const client_name = (typeof body.client_name === 'string' ? body.client_name : body.client_id) || 'mcp-chatgpt';
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
    directAccessGrantsEnabled: false,
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
    ? `${KEYCLOAK_PUBLIC_URL.replace(/\/$/, '')}/realms/${KEYCLOAK_REALM}/clients-registrations/openid-connect/${client_id}`
    : '';

  const dcrResponse = {
    client_id,
    redirect_uris,
    grant_types: ['authorization_code'] as string[],
    response_types: ['code'] as string[],
    token_endpoint_auth_method: 'none' as const,
    client_name,
    registration_client_uri: registrationClientUri || undefined,
  };

  res.status(201).type('application/json').json(dcrResponse);
}
