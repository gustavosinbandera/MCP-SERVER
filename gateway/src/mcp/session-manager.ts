/**
 * Session Manager for MCP over HTTP: one session per user/sessionId,
 * with per-user limits and idle TTL.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import type { HttpStreamableTransport } from './http-streamable-transport';
import { buildMcpServer } from '../mcp-server';
import { createHttpStreamableTransport } from './http-streamable-transport';

const MAX_SESSIONS_PER_USER = Math.min(
  Math.max(1, Math.floor(Number(process.env.MAX_SESSIONS_PER_USER) || 3)),
  20
);
const SESSION_TTL_MS = Math.min(
  Math.max(60_000, Number(process.env.SESSION_TTL_MS) || 30 * 60 * 1000),
  24 * 60 * 60 * 1000
);
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60s

export interface SessionRuntime {
  server: McpServer;
  transport: HttpStreamableTransport;
  createdAt: number;
  lastUsedAt: number;
}

/** userId -> sessionId -> SessionRuntime */
const sessionsByUser = new Map<string, Map<string, SessionRuntime>>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer(): void {
  if (cleanupTimer !== null) return;
  cleanupTimer = setInterval(() => {
    cleanupIdleSessions();
  }, CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

/**
 * Close sessions that have been idle for more than SESSION_TTL_MS.
 */
export function cleanupIdleSessions(): void {
  const now = Date.now();
  const cutoff = now - SESSION_TTL_MS;
  for (const [userId, map] of sessionsByUser.entries()) {
    for (const [sessionId, runtime] of map.entries()) {
      if (runtime.lastUsedAt < cutoff) {
        runtime.server.close().catch(() => {});
        map.delete(sessionId);
      }
    }
    if (map.size === 0) sessionsByUser.delete(userId);
  }
}

/**
 * Get or create a session for the user.
 * - If sessionId is provided and exists, it is reused and lastUsedAt is updated.
 * - Otherwise, a new session (new McpServer + transport) is created if MAX_SESSIONS_PER_USER is not exceeded.
 * @returns { sessionId, runtime } or an error if the limit is exceeded.
 */
export async function getOrCreateSession(
  userId: string,
  sessionId?: string | null
): Promise<{ sessionId: string; runtime: SessionRuntime } | { error: string; status: number }> {
  ensureCleanupTimer();
  const now = Date.now();
  let userMap = sessionsByUser.get(userId);
  if (!userMap) {
    userMap = new Map();
    sessionsByUser.set(userId, userMap);
  }

  if (sessionId && userMap.has(sessionId)) {
    const runtime = userMap.get(sessionId)!;
    runtime.lastUsedAt = now;
    return { sessionId, runtime };
  }

  // Without sessionId: reuse the user's most recently used session if it exists (prevents Cursor
  // retrying/opening connections without sending mcp-session-id from filling the session limit).
  if (!sessionId?.trim() && userMap.size > 0) {
    let latest: { sessionId: string; runtime: SessionRuntime } | null = null;
    for (const [sid, runtime] of userMap.entries()) {
      if (!latest || runtime.lastUsedAt > latest.runtime.lastUsedAt) {
        latest = { sessionId: sid, runtime };
      }
    }
    if (latest) {
      latest.runtime.lastUsedAt = now;
      return { sessionId: latest.sessionId, runtime: latest.runtime };
    }
  }

  if (userMap.size >= MAX_SESSIONS_PER_USER) {
    return {
      error: `Maximum sessions per user (${MAX_SESSIONS_PER_USER}) reached. Close an existing session or wait for TTL.`,
      status: 429,
    };
  }

  const newSessionId = sessionId?.trim() || crypto.randomUUID();
  const transport = createHttpStreamableTransport();
  const server = buildMcpServer({ userId });
  const tConnect0 = Date.now();
  await server.connect(transport as any);
  if (Date.now() - tConnect0 > 1000) {
    console.warn(`[session] server.connect took ${Date.now() - tConnect0}ms for user ${userId}`);
  }
  const runtime: SessionRuntime = {
    server,
    transport,
    createdAt: now,
    lastUsedAt: now,
  };
  userMap.set(newSessionId, runtime);
  return { sessionId: newSessionId, runtime };
}

/**
 * Close a session explicitly.
 */
export async function closeSession(userId: string, sessionId: string): Promise<boolean> {
  const userMap = sessionsByUser.get(userId);
  if (!userMap) return false;
  const runtime = userMap.get(sessionId);
  if (!runtime) return false;
  try {
    await runtime.server.close();
  } catch (err) {
    console.warn('[session] server.close error', err);
  }
  userMap.delete(sessionId);
  if (userMap.size === 0) sessionsByUser.delete(userId);
  return true;
}

export { MAX_SESSIONS_PER_USER, SESSION_TTL_MS };
