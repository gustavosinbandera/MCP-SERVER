/**
 * MCP transport adapter over HTTP: one request (POST body) = one JSON-RPC message,
 * and the response is returned as the HTTP response body.
 * Compatible with the interface used by Protocol.connect(transport).
 */

import { info as logInfo } from '../logger';

export interface HttpStreamableTransport {
  start(): Promise<void>;
  send(message: unknown, options?: { relatedRequestId?: string; sessionId?: string }): Promise<void>;
  close?(): Promise<void>;
  onmessage?: (message: unknown, extra?: { sessionId?: string; requestInfo?: { headers?: Record<string, string> } }) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  /** Handle an incoming message (POST body) and return the JSON-RPC response when the server calls send(). */
  handleRequest(body: unknown, extra?: { sessionId?: string }): Promise<unknown>;
}

const SESSION_ID_HEADER = 'mcp-session-id';

type Pending = { requestId?: string | number; resolve: (value: unknown) => void; reject: (reason: Error) => void };

/**
 * Create a transport that adapts HTTP request/response to the Protocol contract.
 * - start(): resolves immediately.
 * - send(msg, options): resolves the matching promise: by message.id or options.relatedRequestId when present; otherwise the oldest (FIFO) to avoid hanging.
 * - handleRequest(body): adds a promise to the queue, calls onmessage(body), waits for send(), and returns the message.
 * Supports multiple parallel tool calls: if the response has an id it is matched; otherwise responses are returned in FIFO order.
 */
export function createHttpStreamableTransport(): HttpStreamableTransport {
  const pendingQueue: Pending[] = [];

  const transport: HttpStreamableTransport = {
    async start() {
      // No-op for HTTP; "start" is effectively the first request.
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
