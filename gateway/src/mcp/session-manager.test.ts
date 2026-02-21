/**
 * Unit tests for MCP session manager: limits and TTL cleanup.
 */
import {
  getOrCreateSession,
  closeSession,
  cleanupIdleSessions,
  MAX_SESSIONS_PER_USER,
  SESSION_TTL_MS,
} from './session-manager';

describe('session-manager', () => {
  beforeEach(() => {
    cleanupIdleSessions(); // clear any leftover state from previous tests
  });

  it('getOrCreateSession creates a new session and returns sessionId', async () => {
    const result = await getOrCreateSession('user-a', null);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.sessionId).toBeDefined();
      expect(result.runtime).toBeDefined();
      expect(result.runtime.server).toBeDefined();
      expect(result.runtime.transport).toBeDefined();
    }
  });

  it('getOrCreateSession with same sessionId reuses session', async () => {
    const first = await getOrCreateSession('user-b', null);
    expect('error' in first).toBe(false);
    if ('error' in first) return;
    const second = await getOrCreateSession('user-b', first.sessionId);
    expect('error' in second).toBe(false);
    if ('error' in second) return;
    expect(second.sessionId).toBe(first.sessionId);
  });

  it('getOrCreateSession with null sessionId reuses latest session (evita llenar límite con retries)', async () => {
    const first = await getOrCreateSession('user-reuse', null);
    expect('error' in first).toBe(false);
    if ('error' in first) return;
    const second = await getOrCreateSession('user-reuse', null);
    expect('error' in second).toBe(false);
    if ('error' in second) return;
    expect(second.sessionId).toBe(first.sessionId);
    const third = await getOrCreateSession('user-reuse', undefined);
    expect('error' in third).toBe(false);
    if ('error' in third) return;
    expect(third.sessionId).toBe(first.sessionId);
  });

  it('returns 429 when exceeding MAX_SESSIONS_PER_USER', async () => {
    const userId = 'user-limit-' + Date.now();
    const sessions: string[] = [];
    // Crear N sesiones con ids distintos (con null reutilizaríamos la misma)
    for (let i = 0; i < MAX_SESSIONS_PER_USER; i++) {
      const r = await getOrCreateSession(userId, `sid-${i}`);
      expect('error' in r).toBe(false);
      if (!('error' in r)) sessions.push(r.sessionId);
    }
    const over = await getOrCreateSession(userId, 'sid-over');
    expect('error' in over).toBe(true);
    if ('error' in over) {
      expect(over.status).toBe(429);
      expect(over.error).toMatch(/Maximum|session/i);
    }
    for (const sid of sessions) await closeSession(userId, sid);
  });

  it('closeSession removes session and returns true', async () => {
    const r = await getOrCreateSession('user-close', null);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    const closed = await closeSession('user-close', r.sessionId);
    expect(closed).toBe(true);
    const closedAgain = await closeSession('user-close', r.sessionId);
    expect(closedAgain).toBe(false);
  });

  it('cleanupIdleSessions runs without throwing', () => {
    expect(() => cleanupIdleSessions()).not.toThrow();
  });

  it('SESSION_TTL_MS and MAX_SESSIONS_PER_USER are within expected range', () => {
    expect(SESSION_TTL_MS).toBeGreaterThanOrEqual(60_000);
    expect(SESSION_TTL_MS).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    expect(MAX_SESSIONS_PER_USER).toBeGreaterThanOrEqual(1);
    expect(MAX_SESSIONS_PER_USER).toBeLessThanOrEqual(20);
  });
});
