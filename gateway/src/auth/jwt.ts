/**
 * Simple JWT auth (Cognito) for v1: JWKS verification, no groups/scopes.
 * Middleware requireJwt validates Authorization: Bearer <JWT> and attaches req.auth = { userId }.
 * ADMIN_SUBS: optional allowlist of subs considered admin.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Request, Response, NextFunction } from 'express';

const COGNITO_REGION = (process.env.COGNITO_REGION || '').trim();
const COGNITO_USER_POOL_ID = (process.env.COGNITO_USER_POOL_ID || '').trim();
const COGNITO_APP_CLIENT_ID = (process.env.COGNITO_APP_CLIENT_ID || '').trim();

/** Issuer base for Cognito User Pool (ID tokens). */
function getIssuer(): string {
  if (COGNITO_REGION && COGNITO_USER_POOL_ID) {
    return `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;
  }
  const issuer = (process.env.COGNITO_ISSUER || '').trim();
  return issuer || '';
}

/** JWKS URL for the User Pool (to verify signature). */
function getJwksUrl(): string {
  if (COGNITO_REGION && COGNITO_USER_POOL_ID) {
    return `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}/.well-known/jwks.json`;
  }
  return (process.env.COGNITO_JWKS_URL || '').trim();
}

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (cachedJwks) return cachedJwks;
  const url = getJwksUrl();
  if (!url) throw new Error('JWT: COGNITO_JWKS_URL or COGNITO_REGION+COGNITO_USER_POOL_ID required');
  cachedJwks = createRemoteJWKSet(new URL(url));
  return cachedJwks;
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
 * Verify the JWT and return the payload (sub as userId).
 * Throws if the token is missing or invalid.
 */
export async function verifyJwtAndGetUserId(token: string): Promise<string> {
  const issuer = getIssuer();
  const jwks = getJwks();
  const { payload } = await jwtVerify(token, jwks, {
    issuer: issuer || undefined,
    audience: COGNITO_APP_CLIENT_ID || undefined,
  });
  const sub = payload.sub;
  if (!sub || typeof sub !== 'string') {
    throw new Error('JWT missing sub');
  }
  return sub;
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
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }
  const match = raw.match(/^\s*Bearer\s+(.+)$/i);
  if (!match) {
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
  cachedJwks = null;
  adminSubsCache = null;
}
