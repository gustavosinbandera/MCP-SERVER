/**
 * Session Manager para MCP sobre HTTP: una sesión por usuario/sessionId,
 * con límite por usuario y TTL de inactividad.
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
 * Cierra sesiones que llevan más de SESSION_TTL_MS sin uso.
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
 * Obtiene o crea una sesión para el usuario.
 * - Si sessionId se proporciona y existe, se reutiliza y se actualiza lastUsedAt.
 * - Si no, se crea una nueva sesión (nuevo McpServer + transport) si no se supera MAX_SESSIONS_PER_USER.
 * @returns { sessionId, runtime } o error si se supera el límite.
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

  if (userMap.size >= MAX_SESSIONS_PER_USER) {
    return {
      error: `Maximum sessions per user (${MAX_SESSIONS_PER_USER}) reached. Close an existing session or wait for TTL.`,
      status: 429,
    };
  }

  const newSessionId = sessionId?.trim() || crypto.randomUUID();
  const transport = createHttpStreamableTransport();
  const server = buildMcpServer({ userId });
  await server.connect(transport as any);
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
 * Cierra una sesión explícitamente.
 */
export async function closeSession(userId: string, sessionId: string): Promise<boolean> {
  const userMap = sessionsByUser.get(userId);
  if (!userMap) return false;
  const runtime = userMap.get(sessionId);
  if (!runtime) return false;
  await runtime.server.close();
  userMap.delete(sessionId);
  if (userMap.size === 0) sessionsByUser.delete(userId);
  return true;
}

export { MAX_SESSIONS_PER_USER, SESSION_TTL_MS };
