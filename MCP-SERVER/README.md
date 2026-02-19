# MCP Knowledge Hub

Central MCP Gateway with ChatGPT-like webapp, traceability, and vector search.

## Entorno (Windows + WSL + Docker)

- **Edición**: Cursor en Windows (código se edita aquí).
- **Ejecución**: WSL2 + Docker Desktop. Los contenedores se levantan con `docker compose` desde WSL o PowerShell.
- Si ya tienes **otra instancia Docker** usando los mismos puertos (5432, 6379, 6333, 80), detén esos contenedores antes de levantar este proyecto:
  - `docker compose down` en el otro proyecto, o
  - `docker stop <contenedores>` según corresponda.

## Tech Stack

- **Gateway**: Node.js + TypeScript (MCP, indexación, búsqueda en Qdrant)
- **Worker**: Python (jobs en background; usa Redis + Postgres)
- **Webapp**: Next.js (se construirá más adelante; usará Gateway + Postgres para metadata/trazabilidad)
- **Vector DB**: Qdrant (documentos indexados, búsqueda; el gateway solo usa Qdrant para el Knowledge Hub)
- **Metadata DB**: Postgres (usuario/contraseña: `postgres` / `postgres`) — usado por **worker** y **webapp** para metadata y trazabilidad; el gateway **no** usa Postgres para búsqueda.
- **Queue**: Redis (worker)
- **Reverse proxy**: Nginx (cuando se levanta el stack completo)

## Cómo ejecutar

### Opción A — Solo Gateway + Qdrant (MCP, indexación, búsqueda)

No necesitas Postgres ni Redis. Sirve para usar el MCP en Cursor y indexar/buscar documentación.

1. Levantar **Qdrant** (por ejemplo con Docker): `docker run -d -p 6333:6333 qdrant/qdrant:v1.7.4` o usar el servicio `qdrant` del compose.
2. En **gateway**: copiar o crear `gateway/.env` (ver `gateway/.env.example`). Mínimo: `QDRANT_URL=http://localhost:6333`.
3. Build y ejecución:
   ```powershell
   cd gateway
   npm install
   npm run build
   ```
4. Para el **servidor MCP**: Cursor arranca `node dist/mcp-server.js` según `.cursor/mcp.json`; no hace falta ejecutarlo a mano.
5. Para el **supervisor** (inbox + SHARED_DIRS cada 2 min): `node dist/supervisor.js` o una vez: `node dist/supervisor.js --once`.

### Opción B — Stack completo (Docker: Postgres, Redis, Qdrant, Gateway, Webapp, Nginx)

Necesario cuando quieras usar la **webapp** y el **worker** (metadata/trazabilidad en Postgres).

1. (Opcional) Detener instancia Docker que use puertos 5432, 6379, 6333, 80.
2. En la **raíz del proyecto**: copiar `.env.example` a `.env` (Postgres: `postgres`/`postgres`, etc.).
3. `docker compose up -d`
4. Variables del **gateway** en Docker vienen de compose; para ejecutar el gateway **en local** (fuera de Docker) usa `gateway/.env` (ver `gateway/.env.example`).

## Quick Start (resumen)

- **Solo MCP + Qdrant**: Qdrant en 6333 + `gateway/.env` + `cd gateway && npm run build`. Cursor usa el MCP automáticamente.
- **Stack completo**: `.env` en raíz + `docker compose up -d`. Ver `/docs_repo` para documentación detallada.

## URLs (solo cuando usas Opción B — stack completo con Nginx)

| Qué | URL |
|-----|-----|
| Webapp (búsqueda) | http://localhost |
| Gateway health | http://localhost/api/health |
| Gateway search | http://localhost/api/search?q=docs |

## Conectar el IDE (Cursor, VS Code, etc.) vía MCP

El gateway incluye un **servidor MCP** (stdio) para que el cliente MCP del IDE se conecte y la IA use la documentación indexada.

**La configuración MCP ya está en el repo:**

- **`.cursor/mcp.json`** — Cursor lee este archivo y conecta el servidor **mcp-knowledge-hub** (herramientas `search_docs`, `count_docs`, `analize_code`, `write_flow_doc`, `index_url`, `index_site`, `list_shared_dir`, `read_shared_file`, etc., autoaprobadas).

### Pasos

1. **Abrir el proyecto correcto en Cursor**
   - Abre la carpeta que contiene `docker-compose.yml` y `gateway/` (por ejemplo `MCP-SERVER` dentro del repo). Así Cursor usará el `.cursor/mcp.json` de ese nivel.

2. **Build del gateway** (una vez, o tras cambios en el código):
   ```powershell
   cd gateway
   npm install
   npm run build
   ```

3. **Tener Qdrant en marcha** en `http://localhost:6333` (por ejemplo `docker run -d -p 6333:6333 qdrant/qdrant:v1.7.4` o el servicio `qdrant` del compose). El proceso MCP se ejecuta en tu máquina y debe poder conectar a ese puerto. **No necesitas Postgres ni Redis** para el MCP.

4. **Reiniciar Cursor** por completo después de crear o cambiar `.cursor/mcp.json` para que cargue el servidor MCP.

Cuando esté conectado, la IA tendrá las herramientas **search_docs**, **count_docs**, **analize_code**, **write_flow_doc**, **index_url**, **index_site**, **list_shared_dir**, **read_shared_file** y podrá buscar, contar, analizar código con contexto, guardar nodos de flujo (mapa del proyecto) e indexar URLs desde el Knowledge Hub.

## Probar que la IA lee por MCP (sin escanear archivos)

Para comprobar que la IA usa **solo** la herramienta MCP `search_docs` (y no sus propias herramientas de lectura de archivos):

1. **Archivo de ejemplo**  
   Ya existe: `docs_repo/docs/ejemplo.txt` (contiene una frase de verificación).

2. **Indexar el documento en Qdrant** (una vez, con Qdrant en marcha en `http://localhost:6333`):
   ```powershell
   cd gateway
   npm run index-example
   ```
   (Si no tienes `gateway/.env`, define `$env:QDRANT_URL = "http://localhost:6333"` antes.) O: `node scripts/index-example-doc.cjs`

3. **Preguntar a la IA en Cursor**, por ejemplo:
   - *"¿Qué dice el documento de ejemplo del Knowledge Hub?"*
   - *"Busca en la documentación: ejemplo"*
   - *"¿Cuál es la frase secreta del ejemplo?"*

   Si la IA responde con el contenido de `ejemplo.txt` (por ejemplo la frase *"La IA leyó este texto vía MCP"*), está leyendo **solo** a través del MCP (`search_docs` → Qdrant), no del sistema de archivos.

## Directory Structure

```
/gateway     - MCP Gateway (Node.js)
/worker      - Background worker (Python)
/webapp      - Next.js webapp
/nginx       - Reverse proxy config
/scripts     - Utility scripts
/docs_repo   - Git-versioned docs (source of truth)
```

---

## Documentación completa (referencia)

### Herramientas MCP

El servidor MCP expone estas herramientas para el IDE (Cursor, etc.):

| Herramienta | Descripción |
|-------------|-------------|
| **search_docs** | Busca en la documentación indexada (Qdrant). Parámetros: `query`, `limit` (opcional). |
| **count_docs** | Devuelve cuántos documentos hay en la colección `mcp_docs`. |
| **analize_code** | Análisis de código con contexto de la BD: descripción (bug, funcionalidad, etc.) y opcionalmente `component`, `project` (filtrar por proyecto indexado), `limit` (default 15). |
| **index_url** | Indexa una sola URL (HTML → texto) en Qdrant. Parámetros: `url`. |
| **index_url_with_links** | Indexa una URL y hasta N páginas enlazadas del mismo dominio. Parámetros: `url`, `max_links` (opcional, default 20). |
| **index_site** | Crawl completo de un sitio (BFS desde la URL semilla) hasta un máximo de páginas. Parámetros: `url`, `max_pages` (opcional, default 1000). **Solo bajo demanda** (el supervisor no indexa URLs automáticamente). |
| **write_flow_doc** | Crea un markdown (nodo del mapa de flujos) y lo guarda en **INDEX_INBOX_DIR** para que el supervisor lo indexe. **Cuándo:** (1) Si el usuario dice "usar-mcp": crea el doc y añade información para formar un mapa de cómo se interconecta el código. (2) Si usas una tool de análisis/revisión de flujo (analize_code, search_docs) y hay resultados relevantes: también crea y almacena el doc. Los documentos generados por la IA llevan en el frontmatter `generated_by_ia: true` y `source: ai_generated` para identificarlos explícitamente. Parámetros: `title`, `description`; opcional: `files`, `functions`, `flow_summary`, `bug_id`, `project`. |
| **list_shared_dir** | Lista directorios/archivos en un directorio compartido. Parámetros: `relative_path` (opcional; vacío = raíz). |
| **read_shared_file** | Lee el contenido de un archivo de un directorio compartido. Parámetros: `relative_path`. |

### Indexación (supervisor vs bajo demanda)

- **Supervisor** (`node dist/supervisor.js`): cada 2 min (o `SUPERVISOR_INTERVAL_MS`) revisa **INDEX_INBOX_DIR** (indexa y borra) y **SHARED_DIRS** (indexa sin borrar). **No indexa URLs**; esas son solo bajo demanda.
- **URLs**: indexación de URLs/sitios **solo bajo demanda** con las herramientas MCP **index_url**, **index_url_with_links**, **index_site** (por ejemplo desde Cursor). Las variables `INDEX_URLS` e `INDEX_SITE_URLS` en el gateway **no** se usan en el ciclo del supervisor.
- **Límite por sitio** (cuando uses `index_site`): `INDEX_SITE_MAX_PAGES` (default 1000; máximo 10000).

### Login (sitios con autenticación)

- **Basic Auth:** Si el sitio pide HTTP Basic, se usan `INDEX_URL_USER` e `INDEX_URL_PASSWORD` en todas las peticiones de indexación.
- **Login por formulario (MediaWiki, p. ej. dev.magaya.com):** El gateway obtiene un token de la API MediaWiki (`/api.php`), hace `action=login` con usuario y contraseña, guarda las cookies en memoria y las envía en las peticiones siguientes a ese host. Así se indexan sitios que devuelven "Login required" sin Basic Auth.
- **Probar login:** Desde `gateway`: `npm run test-login [URL]`. Si no pasas URL, usa la primera de `INDEX_URLS` o de `INDEX_SITE_URLS`, o una por defecto. Deberías ver `[Login] Sesión iniciada en <host>` si el login MediaWiki funciona.

### Directorios compartidos (SHARED_DIRS)

- Formato en **gateway/.env**: `proyecto:ruta` o solo `ruta`. Varios: separar con `;` o `|`. Ejemplo: `BlueIvory-main:D:/repos/main;BlueIvory-legacy:D:/repos/legacy`.
- El **supervisor** indexa el contenido de cada ruta en Qdrant con ese nombre de **proyecto** (evita colisiones cuando el mismo path existe en otro branch/legacy).
- Las herramientas **list_shared_dir** y **read_shared_file** leen desde esas rutas (para listar/leer archivos por nombre).

### Inbox (INDEX_INBOX_DIR)

- Carpeta vigilada por el supervisor. Archivos/carpetas que coloques ahí se **indexan en Qdrant y luego se eliminan**. Extensiones de texto/código (`.txt`, `.md`, `.js`, `.ts`, `.cpp`, etc.) se indexan; comprimidos y ejecutables se ignoran.
- **INDEX_INBOX_PROJECT** (opcional): nombre de proyecto para todo lo que indexes desde el inbox en esa ejecución (ej. `BlueIvory-rc-hotfix`). Evita colisiones con otro branch/legacy; sin esta variable se usa el nombre de la carpeta superior.

### Mapa de flujos (write_flow_doc)

- Al investigar un bug (ej. accounting), la IA puede usar **analize_code** o **search_docs** para encontrar código relevante en la BD, relacionar archivos y funciones con el bug y luego usar **write_flow_doc** para guardar un markdown que describe el flujo (archivos, funciones, descripción).
- Ese markdown se escribe en **INDEX_INBOX_DIR**; el supervisor lo indexa en el próximo ciclo y pasa a formar parte del Knowledge Hub como **nodo del mapa de flujos**. Así, a medida que se resuelven bugs o se analizan funcionalidades, se va armando un mapa indexado del proyecto que luego se puede buscar (p. ej. "accounting flow", "shipment").

### Variables de entorno (gateway)

Todas en **gateway/.env** (no en la raíz). La raíz `.env` es para Docker (Postgres, Redis, etc.).

| Variable | Uso | Ejemplo |
|----------|-----|---------|
| QDRANT_URL | URL de Qdrant | `http://localhost:6333` |
| INDEX_INBOX_DIR | Carpeta inbox (supervisor indexa y borra) | `C:/PROYECTOS/MCP-SERVER/INDEX_INBOX` |
| INDEX_INBOX_PROJECT | Nombre de proyecto para lo indexado desde inbox (opcional) | `BlueIvory-rc-hotfix` |
| SHARED_DIRS | Carpeta(s) compartida(s); formato `proyecto:ruta` o `ruta` | `D:/repos/main` o `BlueIvory-main:D:/repos/main` |
| SUPERVISOR_INTERVAL_MS | Intervalo del supervisor: inbox + SHARED_DIRS (ms) | `120000` (2 min) |
| RESTART_DELAY_MS | Espera tras fallo del ciclo (ms) | `10000` |
| KNOWLEDGE_HUB_NAME | Nombre del proyecto en respuestas MCP (opcional) | `BlueIvory Beta` |
| INDEX_SITE_MAX_PAGES | Límite al usar herramienta index_site | `1000` |
| INDEX_URL_USER / INDEX_URL_PASSWORD | Basic Auth / login MediaWiki (indexación de URLs) | opcional |

Ver **gateway/.env.example** para una plantilla.

### Contexto: Magaya / Hyperion

- **dev.magaya.com** es la wiki de desarrollador (Hyperion): documentación de la API, extensiones, Node (`@magaya/hyperion-node`), etc. Es la capa **JavaScript** que usa el cliente.
- El **núcleo** que se mantiene es **C++** y **GSAM**; **hyperion-node** es el binding Node que conecta ese core con el mundo JS. **SOAP service** y APIs en **C** son productos relacionados del mismo ecosistema. Indexar dev.magaya.com da a la IA el contexto de la API y extensiones; el código C++/GSAM suele estar en repos internos o en la VM.

### Scripts útiles (gateway)

| Comando | Descripción |
|---------|-------------|
| `npm run build` | Compila TypeScript a `dist/`. |
| `npm run supervisor` | Arranca el supervisor: cada 2 min revisa **inbox** y **SHARED_DIRS** (no indexa URLs). |
| `node dist/supervisor.js --once` | Un solo ciclo (inbox + SHARED_DIRS) y termina. |
| `npm run mcp` | Arranca el servidor MCP (stdio); Cursor suele arrancarlo automáticamente. |
| `npm run test-login [URL]` | Prueba login (MediaWiki/Basic Auth) y fetch de una URL. |
| `npm run index-example` | Indexa el documento de ejemplo en Qdrant (para pruebas de search_docs). |
