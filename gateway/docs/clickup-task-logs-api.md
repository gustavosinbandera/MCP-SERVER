# Gestión de logs MCP: API, archivo, SSE y página web

## Resumen

Se implementó un sistema de logs para diagnosticar requests MCP que se quedan pegados (p. ej. en búsqueda en BD): escritura en archivo, API REST para consultar, stream en vivo por SSE y una página web con combobox para filtrar por tipo de log.

## Qué se hizo

### 1. Logger con archivo y contexto de request

- **Archivo:** `gateway/src/logger.ts`
- Cada log se escribe en **archivo** (por defecto `logs/mcp.log`; configurable con `MCP_LOG_PATH`).
- **AsyncLocalStorage** para incluir `userId` y `sessionId` en cada entrada cuando el request pasa por POST /mcp.
- **`runWithLogContext(context, fn)`** para ejecutar el handler MCP con ese contexto.
- **`subscribeToLogEntries(cb)`** para que otros módulos reciban cada nueva entrada en tiempo real (usado por SSE).

### 2. Logs de diagnóstico en el flujo

- **`gateway/src/search.ts`:** `logInfo` en pasos de `searchDocs` (start, collections, embed, search/scroll, done) con `elapsedMs` para localizar dónde se bloquea.
- **`gateway/src/mcp-server.ts`:** `logInfo` al inicio y fin de la tool `search_docs`.
- **`gateway/src/index.ts`:** POST /mcp envuelto en `runWithLogContext`; logs de inicio, fin, lentitud y error con `userId` y `sessionId`.

### 3. API de logs (protegida por JWT)

- **GET /logs** — Consulta: `tail` (1–2000), `userId`, `message`, `filter` (searchDocs | tool_search_docs | mcp_post | error). Devuelve JSON con `path`, `count`, `entries`.
- **GET /logs/stream** — **SSE:** stream en vivo. Envía un bloque inicial (últimas `tail` entradas del archivo, filtradas) y luego cada nueva entrada que coincida con `filter`. Query: `filter`, `tail`.
- Mismo JWT que POST /mcp (Cognito IdToken o MCP_API_KEY).

### 4. Página web GET /logs/view

- **Combobox "Tipo de log":** Todos, searchDocs, tool search_docs, mcp POST, Solo errores.
- **userId** opcional para filtrar.
- **Cargar (últimas 200):** fetch a GET /logs con el filtro elegido.
- **Stream en vivo (SSE):** fetch a GET /logs/stream, lectura del body como stream, parseo de eventos `data: {...}\n\n` e inserción de filas en la tabla en tiempo real.
- **Parar stream:** aborta la petición en curso.
- Pide IdToken la primera vez (se puede guardar en localStorage).

### 5. Documentación

- **`gateway/docs/LOGS-MCP-BUSQUEDA.md`:** configuración (`MCP_LOG_PATH`), rutas (logs, logs/stream, logs/view), lectura desde host (Docker) e instancia (SSH), filtros por userId/sessionId/mensaje, filtro `filter` para la API y el combobox, rotación del archivo.
- **`gateway/.env.example`:** comentario y ejemplo de `MCP_LOG_PATH`.

### 6. Scripts

- **`gateway/scripts/clickup-complete-task-by-id.cjs`:** marca una tarea como completada por `--task-id` (y opcionalmente `--list-id` o LIST_ID en .env). Reutiliza la lógica de estado "completado" de la lista.

## Dónde está

- Logger y suscripción: `gateway/src/logger.ts`
- Rutas /logs, /logs/stream, /logs/view y helpers: `gateway/src/index.ts`
- Logs de búsqueda: `gateway/src/search.ts`
- Logs de la tool search_docs: `gateway/src/mcp-server.ts`
- Documentación: `gateway/docs/LOGS-MCP-BUSQUEDA.md`

## Cómo usar (con DNS mcp.domoticore.co)

- **Página:** http://mcp.domoticore.co/api/logs/view — elegir tipo en el combobox, "Cargar" o "Stream en vivo".
- **API:** `curl -H "Authorization: Bearer TOKEN" "http://mcp.domoticore.co/api/logs?tail=100&filter=searchDocs"`
- **SSE:** `curl -N -H "Authorization: Bearer TOKEN" "http://mcp.domoticore.co/api/logs/stream?filter=searchDocs"`

## Relación con el cambio en Git

Commit que introduce esta funcionalidad:

**Commit:** (se rellena tras el push)  
**Enlace:** (URL de GitHub al commit)
