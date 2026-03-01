/**
 * Per-session queue to serialize MCP requests in the gateway.
 * One request at a time per (userId, sessionId) so responses don't cross
 * and the transport FIFO fallback assigns each response correctly.
 */

import type { HttpStreamableTransport } from './http-streamable-transport';

export type SessionRuntime = {
  server: unknown;
  transport: HttpStreamableTransport;
  createdAt: number;
  lastUsedAt: number;
};

export type EnqueueResult = { result: unknown; handleRequestStartedAt: number };

type QueueItem = {
  body: unknown;
  resolve: (value: EnqueueResult) => void;
  reject: (err: Error) => void;
  runtime: SessionRuntime;
  sessionId: string;
  userId: string;
  t0: number;
};

/** key = `${userId}:${sessionId}` -> queue and processing state */
const sessionQueues = new Map<
  string,
  { queue: QueueItem[]; processing: boolean }
>();

function getQueueKey(userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`;
}

/**
 * Process the next queue item for this session (if present and not already processing).
 */
function processNext(key: string): void {
  const state = sessionQueues.get(key);
  if (!state || state.processing || state.queue.length === 0) return;

  const item = state.queue.shift()!;
  state.processing = true;
  item.runtime.lastUsedAt = Date.now();

  const handleRequestStartedAt = Date.now();
  item.runtime.transport
    .handleRequest(item.body, { sessionId: item.sessionId })
    .then((result) => {
      state.processing = false;
      item.resolve({ result, handleRequestStartedAt });
      processNext(key);
    })
    .catch((err: unknown) => {
      state.processing = false;
      item.reject(err instanceof Error ? err : new Error(String(err)));
      processNext(key);
    });
}

/**
 * Enqueue a request for the session and return a promise that resolves
 * when that request has been processed (its turn + handleRequest completed).
 */
export function enqueueAndWait(
  userId: string,
  sessionId: string,
  runtime: SessionRuntime,
  body: unknown,
  t0: number
): Promise<EnqueueResult> {
  const key = getQueueKey(userId, sessionId);
  let state = sessionQueues.get(key);
  if (!state) {
    state = { queue: [], processing: false };
    sessionQueues.set(key, state);
  }

  return new Promise<EnqueueResult>((resolve, reject) => {
    state!.queue.push({
      body,
      resolve,
      reject,
      runtime,
      sessionId,
      userId,
      t0,
    });
    processNext(key);
  });
}

/**
 * Clear a session queue (e.g. when closing a session).
 */
export function clearSessionQueue(userId: string, sessionId: string): void {
  const key = getQueueKey(userId, sessionId);
  const state = sessionQueues.get(key);
  if (state) {
    for (const item of state.queue) {
      item.reject(new Error('Session queue cleared'));
    }
    sessionQueues.delete(key);
  }
}
