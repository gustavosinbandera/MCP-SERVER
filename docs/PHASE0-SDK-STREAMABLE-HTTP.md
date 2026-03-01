# Phase 0 — SDK and Streamable HTTP transport

## SDK verification

- **Package:** `@modelcontextprotocol/sdk` (version in use: see `gateway/package.json`).
- **Search in `node_modules/@modelcontextprotocol/sdk`:**
  - There is no export/class in `dist/` named `StreamableHttp`, `NodeStreamableHTTPServerTransport`, or `streamable`.
  - Server-side exports available in the published package are: `Server`, `McpServer`, `StdioServerTransport` (from `@modelcontextprotocol/sdk/server` and `server/stdio`).
- **Docs and issues:** The repo docs and issue [#220](https://github.com/modelcontextprotocol/typescript-sdk/issues/220) mention "Streamable HTTP" support and examples (`simpleStreamableHttp.ts`); those are not included in the **published build** of the SDK version used by this project.

## Transport contract (Protocol/Server)

From `node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.js` and `server/stdio.js` we can infer the interface a transport must implement for `server.connect(transport)`:

- **Methods:**  
  - `start(): Promise<void>`  
  - `send(message, options?): Promise<void>`  
  - `close(): Promise<void>` (opcional; stdio lo implementa)
- **Callbacks (assignable):**  
  - `onmessage?(message, extra?)`  
  - `onclose?()`  
  - `onerror?(error)`

The stdio framing uses line-delimited JSON-RPC (one line per message, serialized as `JSON.stringify(message) + '\n'`). For Streamable HTTP, the MCP spec uses POST with a JSON-RPC body and, optionally, SSE for server→client notifications.

## Decision (v1)

- There is **no** ready-to-use Streamable HTTP server transport in the installed SDK.
- **In v1** we will implement a **custom transport** compatible with the SDK `Server`/`McpServer`:
  - An HTTP endpoint (e.g. `POST /mcp`) that receives the JSON-RPC body, forwards it to `transport.onmessage`, and sends the HTTP response based on what `transport.send` produces.
  - Optional: SSE on the same endpoint or an auxiliary endpoint for server→client notifications, if we want to align with the Streamable HTTP spec later.
- The **MCP logic** (tools, resources, etc.) stays unchanged; we only add a transport layer that adapts HTTP Request/Response to the interface above.

## Exit criteria

- [x] Clear list of SDK classes/exports used: `McpServer`, `StdioServerTransport` from `@modelcontextprotocol/sdk/server` and `server/stdio`.
- [x] Documented decision: **custom** Streamable HTTP transport in v1, compatible with the SDK Protocol/Server interface.
