# Fase 0 — SDK y transport Streamable HTTP

## Verificación del SDK

- **Paquete:** `@modelcontextprotocol/sdk` (versión en uso: ver `gateway/package.json`).
- **Búsqueda en `node_modules/@modelcontextprotocol/sdk`:**
  - No existe en `dist/` ningún export ni clase con nombre `StreamableHttp`, `NodeStreamableHTTPServerTransport` ni `streamable`.
  - Los exports de servidor disponibles en el paquete publicado son: `Server`, `McpServer`, `StdioServerTransport` (desde `@modelcontextprotocol/sdk/server` y `server/stdio`).
- **Documentación y issues:** La documentación del repo y el issue [#220](https://github.com/modelcontextprotocol/typescript-sdk/issues/220) mencionan soporte para "Streamable HTTP" y ejemplos (`simpleStreamableHttp.ts`); esos elementos no están incluidos en el **build publicado** de la versión actual del SDK en este proyecto.

## Contrato del transport (Protocol/Server)

Del código en `node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.js` y `server/stdio.js` se deduce la interfaz que debe cumplir un transport para `server.connect(transport)`:

- **Métodos:**  
  - `start(): Promise<void>`  
  - `send(message, options?): Promise<void>`  
  - `close(): Promise<void>` (opcional; stdio lo implementa)
- **Callbacks (asignables):**  
  - `onmessage?(message, extra?)`  
  - `onclose?()`  
  - `onerror?(error)`

El framing stdio usa mensajes JSON-RPC por líneas (una línea por mensaje, serialización con `JSON.stringify(message) + '\n'`). Para HTTP Streamable, la spec MCP utiliza POST con cuerpo JSON-RPC y, opcionalmente, SSE para notificaciones servidor→cliente.

## Decisión (v1)

- **No existe** en el SDK instalado un transport Streamable HTTP listo para usar en el servidor.
- **En v1** se implementará un **transport custom** compatible con el `Server`/`McpServer` del SDK:
  - Endpoint HTTP (p. ej. `POST /mcp`) que reciba el cuerpo JSON-RPC, lo pase a `transport.onmessage`, y envíe la respuesta con el resultado de `transport.send`.
  - Opcional: SSE en el mismo endpoint o en uno auxiliar para notificaciones servidor→cliente, si se desea alinear con la spec Streamable HTTP más adelante.
- La **lógica MCP** (tools, recursos, etc.) no se toca; solo se añade una capa de transport que adapta Request/Response HTTP a la interfaz anterior.

## Criterio de salida

- [x] Lista clara de clases/exports del SDK usados: `McpServer`, `StdioServerTransport` desde `@modelcontextprotocol/sdk/server` y `server/stdio`.
- [x] Decisión documentada: transport Streamable HTTP **custom** en v1, compatible con la interfaz del Protocol/Server del SDK.
