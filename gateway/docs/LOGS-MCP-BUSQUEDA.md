# Logs de MCP y búsqueda (diagnóstico de requests pegados)

Los logs del flujo MCP (POST /mcp, tools, searchDocs) se escriben en un **archivo** además de stdout/stderr, para poder revisar después de un request que se quedó colgado (p. ej. búsqueda en BD).

## Ver logs en la web (API + página)

El gateway expone dos rutas protegidas por el mismo JWT que `/mcp` (Bearer token):

| Ruta | Descripción |
|------|-------------|
| **GET /api/logs** | API JSON: últimas entradas del archivo de log. Query: `tail`, `userId`, `message`, `filter` (ver abajo). |
| **GET /api/logs/stream** | **SSE:** stream en vivo de nuevas entradas. Query: `filter`, `tail` (entradas iniciales desde archivo). Mismo JWT que `/mcp`. |
| **GET /api/logs/view** | Página HTML: combobox para elegir tipo de log (Todos, searchDocs, tool search_docs, mcp POST, Solo errores), botón "Cargar" (fetch) y "Stream en vivo" (SSE). |

Con el DNS ya configurado (p. ej. **mcp.domoticore.co**):

- **Página:** abre en el navegador `http://mcp.domoticore.co/api/logs/view` y, cuando te lo pida, pega tu **IdToken** (el mismo Bearer que usas en Cursor). Luego usa el formulario para elegir cantidad de líneas y filtrar por `userId` o texto en `message`.
- **API desde curl:**  
  `curl -s -H "Authorization: Bearer TU_ID_TOKEN" "http://mcp.domoticore.co/api/logs?tail=100&userId=abc123"`

El token debe ser el mismo que usas para `POST /api/mcp` (Cognito IdToken o MCP_API_KEY).

**Filtro `filter` (combobox / query):** `''` (todos), `searchDocs`, `tool_search_docs`, `mcp_post`, `error` (solo nivel error).

## Configuración

- **Variable de entorno:** `MCP_LOG_PATH`
  - Si **no** se define: se usa por defecto `logs/mcp.log` **relativo al directorio de trabajo** del proceso (al arrancar el gateway, suele ser la raíz del proyecto o `gateway/`).
  - Si se define: ruta absoluta o relativa al cwd. Ejemplo: `MCP_LOG_PATH=/var/log/mcp-gateway/mcp.log`.
- El directorio del archivo se crea automáticamente si no existe.
- Cada línea del archivo es un **JSON** con: `ts`, `level`, `message`, y opcionalmente `userId`, `sessionId`, y campos extra (`elapsedMs`, `query`, etc.).

## Dónde está el archivo

| Entorno | Cwd típico | Ruta por defecto del log |
|--------|------------|---------------------------|
| **Local** (desde `gateway/`) | `gateway/` | `gateway/logs/mcp.log` |
| **Docker** (WORKDIR en imagen) | p. ej. `/app` o `/app/gateway` | `logs/mcp.log` dentro del contenedor (p. ej. `/app/logs/mcp.log`) |
| **EC2 / host** (systemd o node) | según el servicio | `logs/mcp.log` respecto al cwd del proceso |

Para no depender del cwd, define en `.env` o en el servicio una ruta absoluta, por ejemplo:

```bash
MCP_LOG_PATH=/var/log/mcp-gateway/mcp.log
```

---

## Leer logs desde el host (tu máquina, con Docker)

Si el gateway corre en Docker en tu máquina o en un servidor al que tienes acceso:

```bash
# Contenedor llamado "gateway" (ajusta el nombre si es otro)
CONTAINER=gateway

# Ver las últimas 100 líneas
docker exec $CONTAINER tail -n 100 /app/logs/mcp.log

# Seguir el archivo en tiempo real
docker exec -it $CONTAINER tail -f /app/logs/mcp.log

# Si el log está en otro path dentro del contenedor, descúbrelo con:
docker exec $CONTAINER sh -c 'echo $MCP_LOG_PATH'
# o
docker exec $CONTAINER ls -la logs/
```

Si montas un volumen para el log en el host (p. ej. `./logs:/app/logs`):

```bash
tail -n 200 logs/mcp.log
tail -f logs/mcp.log
```

---

## Leer logs desde la instancia (SSH a EC2 / servidor)

Conectado por SSH al servidor donde corre el gateway:

```bash
# Ruta por defecto (cwd = directorio del proyecto)
tail -n 100 ~/MCP-SERVER/logs/mcp.log
# o si el proceso arranca desde gateway/
tail -n 100 ~/MCP-SERVER/gateway/logs/mcp.log

# Seguir en tiempo real
tail -f ~/MCP-SERVER/gateway/logs/mcp.log
```

Si usas `MCP_LOG_PATH` absoluto (p. ej. `/var/log/mcp-gateway/mcp.log`):

```bash
tail -n 100 /var/log/mcp-gateway/mcp.log
tail -f /var/log/mcp-gateway/mcp.log
```

---

## Filtros por usuario (userId)

Cada línea es JSON. Para ver solo los logs de un usuario (p. ej. cuando se pega la búsqueda y quieres ver solo ese usuario):

**Con `grep` (rápido):**

```bash
# Solo líneas que contienen ese userId (p. ej. sub de Cognito o api-key-user)
grep '"userId":"abc123-sub-cognito"' logs/mcp.log

# Desde Docker
docker exec $CONTAINER grep '"userId":"abc123-sub-cognito"' /app/logs/mcp.log

# Últimas 50 líneas filtradas por userId
tail -n 500 logs/mcp.log | grep '"userId":"abc123-sub-cognito"'
```

**Con `jq` (si está instalado, para leer el JSON):**

```bash
# Solo líneas donde userId coincide
cat logs/mcp.log | jq -c 'select(.userId == "abc123-sub-cognito")'

# Últimas 1000 líneas, filtrar por userId y mostrar message y elapsedMs
tail -n 1000 logs/mcp.log | jq -c 'select(.userId == "abc123-sub-cognito") | {ts, message, elapsedMs, sessionId}'
```

---

## Filtros por sesión (sessionId)

```bash
grep '"sessionId":"sess_xyz"' logs/mcp.log
tail -n 500 logs/mcp.log | jq -c 'select(.sessionId == "sess_xyz")'
```

---

## Filtros por mensaje (buscar dónde se pegó)

Para ver hasta qué paso llegó un request antes de quedarse colgado:

```bash
# Solo pasos de searchDocs (collections, embed, search, scroll, done)
grep 'searchDocs' logs/mcp.log

# Solo tool search_docs (inicio y fin)
grep 'tool search_docs' logs/mcp.log

# Combinado: searchDocs de un usuario
grep '"userId":"TU_USER_ID"' logs/mcp.log | grep 'searchDocs'
```

Orden de los mensajes que verás en un flujo normal de búsqueda:

1. `mcp POST start` (userId, sessionId, method)
2. `tool search_docs start` (query)
3. `searchDocs start` (query, limit)
4. `searchDocs step=collections` (elapsedMs)
5. `searchDocs step=embed` (elapsedMs) — solo si hay embeddings
6. `searchDocs step=search` o `searchDocs step=scroll` (elapsedMs, count)
7. `searchDocs done` (elapsedMs, total)
8. `tool search_docs end` (elapsedMs, total)
9. `mcp POST ok` (totalMs)

Si el request se queda colgado, la **última línea** de ese usuario/sesión antes del silencio indica dónde se trabó (p. ej. después de `step=collections` y antes de `step=embed` → problema en **embed**; después de `step=embed` y antes de `step=search` → problema en **Qdrant search**).

---

## Rotación del archivo

El proceso solo **añade** al archivo (append). No hay rotación automática. Para evitar que el disco se llene:

- Usar **logrotate** (o equivalente) en el host/instancia apuntando a la ruta de `MCP_LOG_PATH`, o
- Reiniciar el servicio y renombrar/archivar `mcp.log` periódicamente (cron + `mv logs/mcp.log logs/mcp.log.old` antes de reiniciar).
