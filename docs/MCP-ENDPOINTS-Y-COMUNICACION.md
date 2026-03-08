# Endpoints y mecanismos de comunicación del MCP Gateway

Documento de referencia de los endpoints HTTP del gateway y los mecanismos de comunicación (OAuth, JWT, SSE, WebSocket, JSON-RPC).

**Servicio:** MCP Knowledge Hub Gateway  
**Puerto por defecto:** `GATEWAY_PORT=3001`  
**Tras nginx:** las rutas del gateway se exponen también bajo el prefijo `/api/` (ej. `https://mcp.domoticore.co/api/health`).

---

## 1. Resumen de mecanismos de comunicación

| Mecanismo | Uso |
|-----------|-----|
| **HTTP/1.1 + JSON** | Casi todos los endpoints: REST (GET/POST/PUT/DELETE) y cuerpo JSON donde aplica. |
| **JSON-RPC 2.0** | Protocolo MCP sobre POST: mensajes `initialize`, `tools/list`, `tools/call`, etc. |
| **JWT (Bearer)** | Autenticación de la mayoría de endpoints protegidos (Cognito, Keycloak o API key). |
| **OAuth 2.0 (RFC 9728)** | Recurso protegido OAuth para clientes como ChatGPT; discovery vía PRM. |
| **DCR (RFC 7591)** | Registro dinámico de clientes OAuth (ChatGPT): POST crear cliente, GET resolver con `registration_access_token`. |
| **SSE (Server-Sent Events)** | Stream de logs en tiempo real: `GET /logs/stream` con `Authorization: Bearer <JWT>`. |
| **WebSocket** | Túnel Azure DevOps: cliente local se conecta al gateway para que las peticiones Azure salgan desde la instancia (puerto `AZURE_TUNNEL_PORT`, ej. 3097). |

---

## 2. Endpoints por categoría

### 2.1 Salud e información

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/health` | No | Health check. Respuesta: `{ status: 'ok', service: 'mcp-gateway', timestamp }`. |
| GET | `/` | No | Información del servicio y lista de endpoints (health, search, stats, logs, files). |

### 2.2 OAuth y Protected Resource Metadata (RFC 9728)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/.well-known/oauth-protected-resource` (y variantes con sufijo) | No | PRM del recurso MCP. Devuelve `resource`, `authorization_servers`, `scopes_supported`. Usado por ChatGPT para discovery. |

Variables de entorno relevantes: `MCP_OAUTH_RESOURCE`, `MCP_OAUTH_RESOURCE_ROOT`, `KEYCLOAK_ISSUER`, `KEYCLOAK_PUBLIC_URL`, `KEYCLOAK_REALM`.  
Nginx puede reenviar también rutas como `/.well-known/oauth-protected-resource/api/mcp` y `/api/mcp/.well-known/oauth-protected-resource` al gateway, con cabecera `X-MCP-Resource-URL` para el recurso `/api/mcp`.

### 2.3 DCR – Registro dinámico de clientes OAuth (ChatGPT)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/realms/mcp/clients-registrations/openid-connect` | No (allowlist de `redirect_uris`) | Crea cliente en Keycloak. Body: `redirect_uris`, `grant_types`, etc. Respuesta: `client_id`, `registration_client_uri`, `registration_access_token`. |
| GET | `/realms/mcp/clients-registrations/openid-connect/:clientId` | Bearer `registration_access_token` | Resuelve el cliente (RFC 7591). Devuelve el registro del cliente. |
| GET | `/realms/mcp/clients-registrations/openid-connect/:clientId/` | Idem | Misma funcionalidad con trailing slash. |

Nginx reenvía `^~ /realms/mcp/clients-registrations/openid-connect` al gateway.

### 2.4 MCP (Model Context Protocol)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/mcp` | JWT | Respuesta 405: indicar uso de POST para JSON-RPC y DELETE para cerrar sesión. |
| POST | `/mcp` | JWT | **Canal principal MCP.** Cuerpo: JSON-RPC 2.0 (method, params, id). Cabecera opcional `mcp-session-id` para reutilizar sesión. Respuesta: JSON-RPC result o error. |
| DELETE | `/mcp` | JWT | Cierra sesión MCP. Cabecera obligatoria `mcp-session-id`. Respuesta: 204 o 404. |
| GET | `/mcp/tools` | No | Catálogo público de tools (lista con nombre, descripción, argumentos). |
| GET | `/mcp/tools/:name` | No | Detalle de una tool por nombre. 404 si no existe. |

**Autenticación MCP:** `Authorization: Bearer <JWT>` (Cognito, Keycloak) o API key configurada en el gateway.  
**Protocolo:** JSON-RPC 2.0 sobre HTTP; sesiones por usuario y `mcp-session-id`; cola por sesión para serializar requests.

### 2.5 Logs (depuración)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/logs` | JWT | Últimas entradas de log. Query: `tail`, `userId`, `message`, `filter` (searchDocs, tool_search_docs, mcp_post, error). |
| GET | `/logs/stream` | JWT | **SSE:** stream en tiempo real de entradas de log. Query: `filter`, `tail`. |
| GET | `/logs/view` | No | Página HTML para ver logs (el token se pide en el cliente). |

### 2.6 Búsqueda y estadísticas

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/search` | No | Búsqueda en el Knowledge Hub (Qdrant). Query: `q`, `limit`. |
| GET | `/stats/indexing` | No | Estadísticas de indexación por día. Query: `days` (1–365). |

### 2.7 Azure DevOps (REST para webapp)

Requisito: `AZURE_DEVOPS_BASE_URL`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT` (o túnel WebSocket activo).

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/azure/work-items` | No | Lista work items por rango de fechas (cualquier estado). Query: `from`, `to` (YYYY-MM-DD), `assignedTo`, `dateField` (created\|changed), `includeChangesets`, `top` (máx. 2000), `skip`. Respuesta: `totalCount`, `count`, `items`. |
| GET | `/azure/work-items/:id` | No | Detalle de un work item con relaciones y changeset IDs. |
| GET | `/azure/changesets` | No | Lista changesets. Query: `project`, `author`, `from`, `to`, `top`. |
| GET | `/azure/changesets/:id` | No | Detalle de un changeset y lista de cambios. |
| GET | `/azure/changesets/:id/diff` | No | Diff de un archivo del changeset. Query: `fileIndex`. |

### 2.8 Explorador de archivos

Rutas relativas al directorio configurado en `FILES_EXPLORER_ROOT`.

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/files/list` | No | Lista contenido de un directorio. Query: `path`. |
| GET | `/files/download` | No | Descarga un archivo. Query: `path`. Bloqueados: .env, .pem, .key, etc. |
| POST | `/files/upload` | No | Subida multipart de archivos. Query: `path`. |
| DELETE | `/files/delete` | No | Borra archivo o directorio vacío. Query: `path`. |

### 2.9 Inbox y Knowledge Base

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/inbox/upload` | No | Subida multipart a inbox (para indexación). Body: `project` opcional. |
| POST | `/kb/upload` | No | Subida de .md a Knowledge Base. Body: `userId`, `project`, `source`. |

---

## 3. Túnel WebSocket (Azure DevOps)

- **Puerto:** `AZURE_TUNNEL_PORT` (ej. 3097). Si es 0, el servidor WebSocket no se inicia.
- **Protocolo:** WebSocket en la ruta raíz del puerto.
- **Autenticación opcional:** `AZURE_TUNNEL_SECRET`; si está definido, el cliente debe enviar un mensaje de autenticación con ese secreto.
- **Uso:** Un cliente local (con VPN/PAT a Azure) se conecta por WebSocket; el gateway reenvía peticiones HTTP a Azure DevOps a través de ese canal, de modo que las credenciales y el acceso a Azure solo están en la instancia.

No es un endpoint HTTP del API REST; es un servidor WebSocket independiente en otro puerto.

---

## 4. CORS y cabeceras

- **CORS:** `Access-Control-Allow-Origin: *`, métodos `GET, POST, PUT, DELETE, OPTIONS`, cabeceras `Authorization, Content-Type`.
- **OPTIONS:** Cualquier ruta responde 204 para preflight.

---

## 5. Rutas tras nginx (producción)

En la configuración típica:

- **Gateway:** `https://mcp.domoticore.co/api/*` → reescritura a `/*` y proxy al gateway (puerto 3001).
- **PRM / OAuth:** Varias rutas `/.well-known/...` y `/api/mcp/.well-known/...` apuntan al gateway o a Keycloak según el caso.
- **DCR:** `/realms/mcp/clients-registrations/openid-connect` se envía al gateway.

Ejemplos de URLs públicas:

- `https://mcp.domoticore.co/api/health`
- `https://mcp.domoticore.co/api/mcp` (POST para MCP)
- `https://mcp.domoticore.co/api/search?q=...`
- `https://mcp.domoticore.co/.well-known/oauth-protected-resource`

---

## 6. Resumen de autenticación

| Tipo | Dónde se usa |
|------|----------------|
| **Sin auth** | Health, `/`, PRM, DCR (con validación de redirect_uris), `/search`, `/stats/indexing`, `/mcp/tools`, `/files/*`, `/inbox/upload`, `/kb/upload`, `/azure/*` (REST webapp), `/logs/view`. |
| **JWT (Bearer)** | `/mcp` (GET/POST/DELETE), `/logs`, `/logs/stream`. JWT de Cognito (webapp) o Keycloak (ChatGPT); también API key si está configurada. |
| **Bearer registration_access_token** | GET DCR para resolver cliente. |
| **OAuth 2.0 (RFC 9728)** | Clientes como ChatGPT usan el PRM para descubrir el recurso y luego flujo authorization_code contra Keycloak para obtener acceso al recurso MCP. |

---

*Documento generado a partir del código del gateway (index.ts, dcr-proxy.ts, auth/jwt.ts, azure/tunnel-server.ts) y nginx.conf.*
