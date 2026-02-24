/**
 * Transport adapter para MCP sobre HTTP: un request (POST body) = un mensaje JSON-RPC,
 * la respuesta se devuelve en el cuerpo de la respuesta HTTP.
 * Compatible con la interfaz que usa Protocol.connect(transport).
 */

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

/** Pending request: resolve/reject for a given JSON-RPC request id. */
type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void };

/**
 * Crea un transport que adapta HTTP request/response al contrato del Protocol.
 * - start(): resuelve de inmediato.
 * - send(msg): resuelve la promesa del handleRequest cuyo id coincide con msg.id (JSON-RPC).
 * - handleRequest(body): registra la promesa por body.id, invoca onmessage(body), espera send() y devuelve el mensaje.
 * Soporta múltiples peticiones concurrentes (varias tools/call en paralelo) asociando cada respuesta al request por id.
 */
export function createHttpStreamableTransport(): HttpStreamableTransport {
  /** request id (string | number) -> pending resolve/reject. Permite respuestas concurrentes. */
  const pendingById = new Map<string | number, Pending>();

  const transport: HttpStreamableTransport = {
    async start() {
      // No-op para HTTP; el "inicio" es la primera petición.
    },

    async send(message: unknown) {
      const responseId =
        message != null && typeof message === 'object' && Object.prototype.hasOwnProperty.call(message, 'id')
          ? (message as { id?: string | number }).id
          : undefined;
      if (responseId === undefined) return;
      const pending = pendingById.get(responseId);
      if (pending) {
        pendingById.delete(responseId);
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
        if (!isNotification && requestId !== undefined) {
          pendingById.set(requestId, { resolve, reject });
        }
        const requestInfo = extra?.sessionId
          ? { headers: { [SESSION_ID_HEADER]: extra.sessionId } }
          : undefined;
        try {
          transport.onmessage?.(body, { sessionId: extra?.sessionId, requestInfo });
          // Notificaciones JSON-RPC no tienen respuesta; el servidor no llamará send().
          if (isNotification) {
            resolve(null);
          }
        } catch (err) {
          if (requestId !== undefined) pendingById.delete(requestId);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
  };

  return transport;
}
