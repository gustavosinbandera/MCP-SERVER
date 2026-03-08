# SSE en el MCP Server, conexión Cursor/cliente MCP y uso con n8n

Documento que resume: (1) la implementación de SSE en el gateway, (2) cómo se conecta un cliente MCP (p. ej. Cursor) al servidor, y (3) ideas para conectar n8n a este MCP server.

---

## 1. Implementación de SSE en el MCP Server

En este proyecto **SSE (Server-Sent Events)** se usa solo para **stream de logs en tiempo real**, no para el protocolo MCP en sí (el MCP va por HTTP request/response con JSON-RPC).

### 1.1 Dónde está implementado

| Componente | Archivo | Función |
|------------|---------|--------|
| **Logger** | `gateway/src/logger.ts` | Escribe cada log en archivo y notifica a suscriptores vía `logSubscribers`. |
| **Suscripción** | `gateway/src/logger.ts` | `subscribeToLogEntries(cb)` añade un callback al `Set`; devuelve una función para desuscribirse. |
| **Endpoint SSE** | `gateway/src/index.ts` | `GET /logs/stream` con JWT; devuelve `text/event-stream` y envía eventos `data: {...}\n\n`. |
| **Vista web** | `gateway/src/index.ts` | `GET /logs/view` sirve una página HTML que puede hacer fetch y abrir el stream SSE. |

### 1.2 Flujo de datos

1. **Escritura de logs**  
   Cualquier llamada a `info()`, `warn()`, `error()` (etc.) en el gateway:
   - Escribe una línea JSON en el archivo de log (`MCP_LOG_PATH` o `logs/mcp.log`).
   - Recorre `logSubscribers` y llama a cada callback con el objeto parseado.

2. **Apertura del stream**  
   El cliente hace `GET /api/logs/stream?filter=...&tail=...` con cabecera `Authorization: Bearer <JWT>`.
   - El handler lee las últimas `tail` entradas del archivo, filtra por `filter` y las envía como eventos.
   - Llama a `subscribeToLogEntries(send)` para que cada **nuevo** log se envíe de inmediato con `res.write('data: ' + JSON.stringify(entry) + '\n\n')`.
   - En `req.on('close')` se desuscribe para no dejar callbacks huérfanos.

3. **Formato de evento**  
   Cada evento SSE es una línea de datos JSON:
   ```text
   data: {"ts":"2026-03-07T10:00:00.000Z","level":"info","message":"mcp POST ok","userId":"...","sessionId":"..."}
   ```

4. **Filtros**  
   Query `filter`: `''` (todos), `searchDocs`, `tool_search_docs`, `mcp_post`, `error`. Solo se envían entradas que coincidan.

### 1.3 Resumen

- **SSE en este servidor = solo logs.**  
- El **protocolo MCP** (tools, initialize, etc.) va por **POST /mcp** con un body JSON-RPC y respuesta en el body; no usa SSE.

---

## 2. Cómo se conecta el cliente MCP (Cursor u otro) al servidor

El gateway expone MCP sobre **HTTP “streamable”**: un request HTTP por cada mensaje JSON-RPC (request en el body, response en el body). La sesión se mantiene con la cabecera `mcp-session-id`.

### 2.1 Dos modos en Cursor (`.cursor/mcp.json`)

**Modo 1: Proceso local (stdio)**  
- El cliente (Cursor) ejecuta un proceso en tu máquina, p. ej. `node gateway/dist/mcp-server.js`.
- La comunicación es por **stdin/stdout**: el cliente envía JSON-RPC por stdin y lee la respuesta por stdout.
- No usa red; el “servidor” MCP corre en local con tus variables de entorno (`QDRANT_URL`, `SHARED_DIRS`, etc.).

```json
"usar-mcp": {
  "command": "node",
  "args": ["C:/PROYECTOS/MCP-SERVER/gateway/dist/mcp-server.js"],
  "env": { "QDRANT_URL": "http://localhost:6333", "SHARED_DIRS": "..." }
}
```

**Modo 2: Servidor remoto (streamable HTTP)**  
- El cliente se conecta a una URL (p. ej. `https://mcp.domoticore.co/api/mcp`) con transporte **streamable-http**.
- Cada mensaje MCP es un **POST** con body JSON-RPC; la respuesta es el body de la respuesta HTTP.
- Autenticación: cabecera `Authorization: Bearer <JWT o API key>`.
- Opcional: cabecera `mcp-session-id` para reutilizar la misma sesión.

```json
"magaya": {
  "url": "https://mcp.domoticore.co/api/mcp",
  "transport": "streamable-http",
  "headers": { "Authorization": "Bearer <token>" }
}
```

### 2.2 Flujo en el servidor (POST /mcp)

1. **Llega POST /mcp** con:
   - `Authorization: Bearer <JWT>` (Cognito, Keycloak o API key configurada en el gateway).
   - Opcional: `mcp-session-id: <uuid>`.
   - Body: un objeto JSON-RPC 2.0 (`jsonrpc`, `id`, `method`, `params`).

2. **Autenticación**  
   El middleware `requireJwt` valida el token y rellena `req.auth.userId`.

3. **Sesión**  
   `getOrCreateSession(userId, sessionId)`:
   - Si llega `mcp-session-id` y existe esa sesión para ese usuario → se reutiliza (y se actualiza `lastUsedAt`).
   - Si no hay sesión o no se envía id → se crea una nueva (nuevo `McpServer` + `HttpStreamableTransport`).
   - Si el usuario ya tiene `MAX_SESSIONS_PER_USER` sesiones → 429.
   - La respuesta puede devolver `mcp-session-id` en cabecera (p. ej. la primera vez) para que el cliente la guarde.

4. **Cola por sesión**  
   Para cada `(userId, sessionId)` hay una cola: **un solo request a la vez**. Así las respuestas se asocian bien al request (el transport hace match por `id` o FIFO).

5. **Transport HTTP**  
   `runtime.transport.handleRequest(body)`:
   - Notifica al `McpServer` con el mensaje entrante.
   - El servidor procesa (initialize, tools/list, tools/call, etc.) y llama a `transport.send(response)`.
   - Ese `send` resuelve la promesa con la respuesta; el handler devuelve ese valor como body HTTP (o 204 si es notificación sin `id`).

6. **Cierre de sesión**  
   `DELETE /mcp` con `mcp-session-id` cierra esa sesión en el servidor.

### 2.3 Mensajes JSON-RPC típicos

- **initialize** – El cliente envía capacidades; el servidor responde con las suyas (y nombre del servidor, etc.).
- **initialized** – Notificación (sin `id`) tras initialize.
- **tools/list** – El servidor responde con la lista de tools (nombre, descripción, schema de argumentos).
- **tools/call** – El cliente pide ejecutar una tool con `name` y `arguments`; el servidor ejecuta y devuelve el resultado en el contenido de la respuesta.

Todos van en el **mismo endpoint** `POST /mcp`; el `method` en el body indica el tipo.

### 2.4 Resumen conexión Cursor → MCP Server

| Paso | Quién | Qué |
|------|--------|-----|
| 1 | Cursor | Lee `.cursor/mcp.json`; si hay `url` + `streamable-http`, usa ese servidor remoto. |
| 2 | Cursor | Obtiene/usa el token (p. ej. el Bearer en `headers`) y lo envía en cada POST. |
| 3 | Cursor | Envía `initialize` (y luego `initialized`); opcionalmente guarda `mcp-session-id` si el servidor la devuelve. |
| 4 | Cursor | Envía `tools/list` para conocer las tools. |
| 5 | Cursor | Cuando el usuario pide una acción, envía `tools/call` con `name` y `arguments`. |
| 6 | Gateway | Resuelve JWT → userId; obtiene/crea sesión; encola el body; transport entrega el mensaje al McpServer y devuelve la respuesta en el body HTTP. |

---

## 3. Cómo conectar n8n a este MCP Server

Este MCP server solo expone **HTTP streamable** (POST con JSON-RPC). No expone stdio ni un endpoint SSE para el protocolo MCP. Para usar n8n hay dos enfoques razonables.

### 3.1 Enfoque A: n8n como cliente MCP (HTTP Request)

n8n puede hablar con el MCP server usando el nodo **HTTP Request** (o similar) para hacer POST a `/api/mcp` con el mismo esquema JSON-RPC.

**Requisitos:**

- **URL:** `https://mcp.domoticore.co/api/mcp` (o la que uses).
- **Autenticación:** Cabecera `Authorization: Bearer <token>`. El token puede ser:
  - Un JWT de Cognito/Keycloak (obtenido antes en el workflow, p. ej. con otro HTTP Request al endpoint de login), o
  - Una API key si el gateway está configurado para aceptarla.
- **Cabecera opcional:** `mcp-session-id` (dejar vacía la primera vez; si el servidor la devuelve en la respuesta, guardarla y enviarla en los siguientes requests).

**Flujo mínimo en n8n:**

1. **Obtener token** (si usas OAuth): nodo HTTP Request a tu IdP (Cognito/Keycloak) para obtener un JWT; guardar el token en una variable.
2. **Initialize:**  
   - Método: POST.  
   - Body (JSON):  
     ```json
     { "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": { "name": "n8n", "version": "1.0" } } }
     ```  
   - Headers: `Authorization: Bearer {{ $json.token }}`, `Content-Type: application/json`.  
   - Si la respuesta trae cabecera `mcp-session-id`, guardarla para los siguientes pasos.
3. **Initialized (notificación):**  
   - POST mismo URL, body:  
     `{ "jsonrpc": "2.0", "method": "initialized", "params": {} }`  
   - Sin `id`; el servidor puede responder 204.
4. **Listar tools:**  
   - POST, body:  
     `{ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }`  
   - La respuesta incluye la lista de tools en `result.tools`.
5. **Invocar una tool:**  
   - POST, body:  
     `{ "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": { "name": "search_docs", "arguments": { "query": "tu búsqueda" } } }`  
   - Usar el mismo `mcp-session-id` en todos los pasos 2–5 para una misma “sesión”.

Puedes encapsular estos pasos en un subworkflow o en nodos reutilizables (token, initialize, tools/call) y pasar parámetros (nombre de tool, argumentos) desde el flujo principal.

### 3.2 Enfoque B: n8n como servidor MCP y este proyecto como “recurso”

n8n puede actuar como **servidor MCP** (p. ej. con el **MCP Server Trigger** y herramientas propias). En ese caso:

- Los **clientes MCP** (Cursor, otro IDE, etc.) se conectan **a n8n**, no directamente a este gateway.
- Si quieres que esos clientes usen las **tools de este MCP server** (search_docs, Azure, etc.), n8n tendría que hacer de **proxy**: recibir la llamada MCP en n8n y, por detrás, hacer HTTP Request a `https://mcp.domoticore.co/api/mcp` como en el enfoque A, y devolver la respuesta al cliente.

Eso implica implementar en n8n (o en un nodo custom) la lógica de “traducir” tools/call de n8n a POST al gateway y devolver el resultado en el formato MCP esperado por el cliente.

### 3.3 Herramientas y documentación n8n

- **MCP en n8n:** n8n puede actuar como servidor MCP (SSE y streamable HTTP) con el **MCP Server Trigger**; los clientes se conectan a n8n.
- **Cliente MCP desde n8n:** No hay un nodo oficial “MCP Client” que hable con un servidor MCP externo; por eso el enfoque práctico es usar **HTTP Request** y el protocolo JSON-RPC descrito arriba.
- Si aparece un paquete tipo `n8n-nodes-mcp` que permita configurar una URL de MCP server y enviar tools/call, se podría usar ese nodo apuntando a `https://mcp.domoticore.co/api/mcp` con el mismo Bearer token y sesión.

### 3.4 Resumen n8n ↔ MCP Server

| Objetivo | Cómo |
|----------|------|
| **n8n invoca tools del MCP server** | Workflow con HTTP Request a `POST /api/mcp`: obtener token, initialize, (opcional) tools/list, tools/call con el Bearer y, si aplica, `mcp-session-id`. |
| **Un cliente MCP use tools “de n8n” que a su vez llamen a este server** | n8n como servidor MCP; en las tools de n8n, implementar llamadas HTTP al gateway (mismo esquema JSON-RPC) y devolver el resultado. |
| **Documentación oficial n8n** | MCP Server Trigger y categoría “Model Context Protocol” en la documentación de n8n. |

Si indicas si quieres que n8n sea solo “cliente” del MCP server o también “servidor” que reexponga estas tools, se puede bajar esto a un flujo concreto de nodos (paso a paso) para tu versión de n8n.
