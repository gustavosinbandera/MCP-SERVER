/**
 * Cola por sesión para serializar requests MCP en el gateway.
 * Un request a la vez por (userId, sessionId) para que las respuestas no se crucen
 * y el fallback FIFO del transport asigne bien cada respuesta.
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

/** key = `${userId}:${sessionId}` -> cola y estado de procesamiento */
const sessionQueues = new Map<
  string,
  { queue: QueueItem[]; processing: boolean }
>();

function getQueueKey(userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`;
}

/**
 * Procesa el siguiente item de la cola para esta sesión (si hay y no estamos procesando).
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
 * Encola un request para la sesión y devuelve una promesa que se resuelve
 * cuando este request haya sido procesado (su turno y handleRequest completado).
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
 * Limpia la cola de una sesión (p. ej. al cerrar sesión).
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
