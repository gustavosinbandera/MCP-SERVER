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

/**
 * Crea un transport que adapta HTTP request/response al contrato del Protocol.
 * - start(): resuelve de inmediato.
 * - send(msg): resuelve la promesa pendiente de handleRequest con msg.
 * - handleRequest(body): establece la promesa, invoca onmessage(body), espera send() y devuelve el mensaje.
 */
export function createHttpStreamableTransport(): HttpStreamableTransport {
  let currentResolve: ((value: unknown) => void) | null = null;
  let currentReject: ((reason: Error) => void) | null = null;

  const transport: HttpStreamableTransport = {
    async start() {
      // No-op para HTTP; el "inicio" es la primera petición.
    },

    async send(message: unknown) {
      if (currentResolve) {
        currentResolve(message);
        currentResolve = null;
        currentReject = null;
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
      return new Promise<unknown>((resolve, reject) => {
        currentResolve = resolve;
        currentReject = reject;
        const requestInfo = extra?.sessionId
          ? { headers: { [SESSION_ID_HEADER]: extra.sessionId } }
          : undefined;
        try {
          transport.onmessage?.(body, { sessionId: extra?.sessionId, requestInfo });
          // Notificaciones JSON-RPC no tienen respuesta; el servidor no llamará send().
          // Resolver ya para no colgar la petición HTTP (p. ej. notifications/initialized).
          if (isNotification) {
            currentResolve = null;
            currentReject = null;
            resolve(null);
          }
        } catch (err) {
          currentResolve = null;
          currentReject = null;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
  };

  return transport;
}
