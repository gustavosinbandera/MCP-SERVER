/**
 * JWT auth: Cognito (webapp) + Keycloak (ChatGPT/OAuth) + API key (Cursor).
 * Middleware requireJwt validates Authorization: Bearer <JWT or API key> and attaches req.auth = { userId }.
 */
import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';
import type { Request, Response, NextFunction } from 'express';

const COGNITO_REGION = (process.env.COGNITO_REGION || '').trim();
const COGNITO_USER_POOL_ID = (process.env.COGNITO_USER_POOL_ID || '').trim();
const COGNITO_APP_CLIENT_ID = (process.env.COGNITO_APP_CLIENT_ID || '').trim();
const KEYCLOAK_PUBLIC_URL = (process.env.KEYCLOAK_PUBLIC_URL || '').trim();
const KEYCLOAK_REALM = (process.env.KEYCLOAK_REALM || 'mcp').trim();

/** Issuer base for Cognito User Pool (ID tokens). */
export function getCognitoIssuer(): string {
  if (COGNITO_REGION && COGNITO_USER_POOL_ID) {
    return `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;
  }
  return (process.env.COGNITO_ISSUER || '').trim();
}

/** Keycloak issuer for realm (access tokens). */
function getKeycloakIssuer(): string {
  if (!KEYCLOAK_PUBLIC_URL || !KEYCLOAK_REALM) return '';
  const base = KEYCLOAK_PUBLIC_URL.replace(/\/$/, '');
  return `${base}/realms/${KEYCLOAK_REALM}`;
}

/** URL del PRM en la raíz del host (ChatGPT espera este endpoint para discovery). */
function getOAuthResourceMetadataUrl(): string | null {
  const root = (process.env.MCP_OAUTH_RESOURCE_ROOT || 'https://mcp.domoticore.co').trim();
  if (!root || !root.startsWith('https://')) return null;
  return `${root.replace(/\/$/, '')}/.well-known/oauth-protected-resource`;
}

/** Set WWW-Authenticate on 401; include resource_metadata (root) so clients (e.g. ChatGPT) can discover OAuth PRM. */
function setAuthChallenge(res: Response): void {
  const metadataUrl = getOAuthResourceMetadataUrl();
  const value = metadataUrl
    ? `Bearer resource_metadata="${metadataUrl}", scope="mcp:tools"`
    : 'Bearer';
  res.setHeader('WWW-Authenticate', value);
}

/** JWKS URL for Cognito User Pool. */
function getCognitoJwksUrl(): string {
  if (COGNITO_REGION && COGNITO_USER_POOL_ID) {
    return `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;
  }
  return (process.env.COGNITO_JWKS_URL || '').trim();
}

/** JWKS URL for Keycloak realm. */
function getKeycloakJwksUrl(): string {
  const iss = getKeycloakIssuer();
  if (!iss) return '';
  return `${iss}/protocol/openid-connect/certs`;
}

let cachedCognitoJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedKeycloakJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getCognitoJwks() {
  if (cachedCognitoJwks) return cachedCognitoJwks;
  const url = getCognitoJwksUrl();
  if (!url) throw new Error('Cognito JWKS not configured');
  cachedCognitoJwks = createRemoteJWKSet(new URL(url));
  return cachedCognitoJwks;
}

function getKeycloakJwks() {
  if (cachedKeycloakJwks) return cachedKeycloakJwks;
  const url = getKeycloakJwksUrl();
  if (!url) throw new Error('Keycloak JWKS not configured');
  cachedKeycloakJwks = createRemoteJWKSet(new URL(url));
  return cachedKeycloakJwks;
}

export type AuthPayload = { userId: string };

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

/**
 * Verify Cognito JWT and return sub as userId. Throws if invalid.
 */
async function verifyCognitoAndGetUserId(token: string): Promise<string> {
  const issuer = getCognitoIssuer();
  if (!issuer) throw new Error('Cognito not configured');
  const jwks = getCognitoJwks();
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience: COGNITO_APP_CLIENT_ID || undefined,
  });
  const sub = payload.sub;
  if (!sub || typeof sub !== 'string') throw new Error('JWT missing sub');
  return sub;
}

/**
 * Verify Keycloak access token and return sub as userId. Throws if invalid.
 */
async function verifyKeycloakAndGetUserId(token: string): Promise<string> {
  const issuer = getKeycloakIssuer();
  if (!issuer) throw new Error('Keycloak not configured');
  const jwks = getKeycloakJwks();
  const { payload } = await jwtVerify(token, jwks, { issuer });
  const sub = payload.sub;
  if (!sub || typeof sub !== 'string') throw new Error('JWT missing sub');
  return sub;
}

/**
 * Verify the JWT (Cognito or Keycloak) and return the payload (sub as userId).
 * Tries Cognito first; if issuer is Keycloak or Cognito fails, tries Keycloak.
 */
export async function verifyJwtAndGetUserId(token: string): Promise<string> {
  let iss: string | undefined;
  try {
    const decoded = decodeJwt(token);
    iss = decoded.iss;
  } catch {
    throw new Error('Invalid JWT format');
  }
  const keycloakIssuer = getKeycloakIssuer();
  if (keycloakIssuer && iss === keycloakIssuer) {
    return verifyKeycloakAndGetUserId(token);
  }
  const cognitoIssuer = getCognitoIssuer();
  if (cognitoIssuer && iss === cognitoIssuer) {
    return verifyCognitoAndGetUserId(token);
  }
  if (cognitoIssuer) {
    try {
      return await verifyCognitoAndGetUserId(token);
    } catch {
      // fallthrough to Keycloak
    }
  }
  if (keycloakIssuer) {
    return verifyKeycloakAndGetUserId(token);
  }
  throw new Error('No JWT issuer configured');
}

/** Optional API key: if MCP_API_KEY is set, Bearer <MCP_API_KEY> is accepted as long-lived auth (does not expire hourly). */
const MCP_API_KEY = (process.env.MCP_API_KEY || '').trim();
/** userId used when authenticating with MCP_API_KEY (e.g. a test user's sub for the same session limit). */
const MCP_API_KEY_USER_ID = (process.env.MCP_API_KEY_USER_ID || '').trim() || 'api-key-user';

/**
 * Middleware: requires Authorization: Bearer <JWT> or Bearer <MCP_API_KEY>.
 * If the token matches MCP_API_KEY, it's accepted as userId MCP_API_KEY_USER_ID (does not expire).
 * Otherwise, it's validated as a Cognito JWT. Returns 401 if missing or invalid.
 */
export function requireJwt(req: Request, res: Response, next: NextFunction): void {
  const raw = req.headers.authorization;
  if (!raw || typeof raw !== 'string') {
    setAuthChallenge(res);
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }
  const match = raw.match(/^\s*Bearer\s+(.+)$/i);
  if (!match) {
    setAuthChallenge(res);
    res.status(401).json({ error: 'Authorization must be Bearer <token>' });
    return;
  }
  const token = match[1].trim();

  if (MCP_API_KEY && token === MCP_API_KEY) {
    req.auth = { userId: MCP_API_KEY_USER_ID };
    next();
    return;
  }

  verifyJwtAndGetUserId(token)
    .then((userId) => {
      req.auth = { userId };
      next();
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthChallenge(res);
      res.status(401).json({ error: 'Invalid or expired token', detail: msg });
    });
}

/** Allowlist of subs considered admin (ADMIN_SUBS=uuid1,uuid2,...). */
function getAdminSubs(): Set<string> {
  const raw = (process.env.ADMIN_SUBS || '').trim();
  if (!raw) return new Set();
  return new Set(raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean));
}

let adminSubsCache: Set<string> | null = null;

export function isAdmin(userId: string): boolean {
  if (adminSubsCache === null) adminSubsCache = getAdminSubs();
  return adminSubsCache.has(userId);
}

/** For tests: reset JWKS and admin-subs caches. */
export function resetAuthCaches(): void {
  cachedCognitoJwks = null;
  cachedKeycloakJwks = null;
  adminSubsCache = null;
}
