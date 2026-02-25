/**
 * Transport adapter para MCP sobre HTTP: un request (POST body) = un mensaje JSON-RPC,
 * la respuesta se devuelve en el cuerpo de la respuesta HTTP.
 * Compatible con la interfaz que usa Protocol.connect(transport).
 */

import { info as logInfo } from '../logger';

export interface HttpStreamableTransport {
  start(): Promise<void>;
  send(message: unknown, options?: { relatedRequestId?: string; sessionId?: string }): Promise<void>;
  close?(): Promise<void>;
  onmessage?: (message: unknown, extra?: { sessionId?: string; requestInfo?: { headers?: Record<string, string> } }) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  /** Maneja un mensaje entrante (cuerpo POST) y devuelve la respuesta JSON-RPC cuando el servidor llama send(). */
  handleRequest(body: unknown, extra?: { sessionId?: string }): Promise<unknown>;
}

const SESSION_ID_HEADER = 'mcp-session-id';

type Pending = { requestId?: string | number; resolve: (value: unknown) => void; reject: (reason: Error) => void };

/**
 * Crea un transport que adapta HTTP request/response al contrato del Protocol.
 * - start(): resuelve de inmediato.
 * - send(msg, options): resuelve la promesa correspondiente: por message.id o options.relatedRequestId si existe; si no, la más antigua (FIFO) para no colgar.
 * - handleRequest(body): añade una promesa a la cola, invoca onmessage(body), espera send() y devuelve el mensaje.
 * Soporta varias tools/call en paralelo: si la respuesta trae id, se empareja; si no, se responde en orden (FIFO).
 */
export function createHttpStreamableTransport(): HttpStreamableTransport {
  const pendingQueue: Pending[] = [];

  const transport: HttpStreamableTransport = {
    async start() {
      // No-op para HTTP; el "inicio" es la primera petición.
    },

    async send(message: unknown, options?: { relatedRequestId?: string; sessionId?: string }) {
      // Match by JSON-RPC response id (message.id or options.relatedRequestId) first; fallback FIFO so no request hangs.
      // Exactly one pending is resolved and removed from the queue; never double-resolve.
      const hasMessageId =
        message != null && typeof message === 'object' && Object.prototype.hasOwnProperty.call(message, 'id');
      const responseId = hasMessageId
        ? (message as { id?: string | number }).id
        : options?.relatedRequestId;
      let pending: Pending | undefined;
      let matchedBy: 'id' | 'fifo' | undefined;
      if (responseId !== undefined && responseId !== null) {
        const idx = pendingQueue.findIndex((p) => p.requestId !== undefined && String(p.requestId) === String(responseId));
        if (idx >= 0) {
          pending = pendingQueue[idx];
          pendingQueue.splice(idx, 1);
          matchedBy = 'id';
        }
      }
      if (!pending && pendingQueue.length > 0) {
        pending = pendingQueue.shift();
        matchedBy = 'fifo';
      }
      if (pending) {
        logInfo('mcp transport send resolve', {
          matchedBy,
          responseId: responseId ?? undefined,
          hasMessageId,
          pendingCount: pendingQueue.length,
        });
        pending.resolve(message);
      }
    },

    async close() {
      transport.onclose?.();
    },

    async handleRequest(body: unknown, extra?: { sessionId?: string }) {
      const isNotification =
        body != null &&
        typeof body === 'object' &&
        !Object.prototype.hasOwnProperty.call(body, 'id');
      const requestId =
        body != null && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'id')
          ? (body as { id?: string | number }).id
          : undefined;

      return new Promise<unknown>((resolve, reject) => {
        if (!isNotification) {
          pendingQueue.push({ requestId, resolve, reject });
        }
        const requestInfo = extra?.sessionId
          ? { headers: { [SESSION_ID_HEADER]: extra.sessionId } }
          : undefined;
        try {
          transport.onmessage?.(body, { sessionId: extra?.sessionId, requestInfo });
          if (isNotification) {
            resolve(null);
          }
        } catch (err) {
          if (!isNotification) {
            const idx = pendingQueue.findIndex((p) => p.resolve === resolve);
            if (idx >= 0) pendingQueue.splice(idx, 1);
          }
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
  };

  return transport;
}
