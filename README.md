# MCP Knowledge Hub

Gateway MCP con búsqueda vectorial (Qdrant), indexación de documentación, webapp tipo ChatGPT y trazabilidad.

---

## Índice (navegación)

- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Ejecución con Docker Compose](#ejecución-con-docker-compose)
- [Ejecución sin Docker (solo MCP + Qdrant)](#ejecución-sin-docker-solo-mcp--qdrant)
- [Herramientas MCP disponibles](#herramientas-mcp-disponibles)
- [Conectar el IDE (Cursor / VS Code)](#conectar-el-ide-cursor--vs-code)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Variables de entorno](#variables-de-entorno)
- [Documentación de referencia](#documentación-de-referencia)

---

## Tecnologías utilizadas

| Componente | Tecnología |
|------------|------------|
| **Gateway MCP** | Node.js, TypeScript, [MCP SDK](https://github.com/modelcontextprotocol/sdk) |
| **Base de datos vectorial** | [Qdrant](https://qdrant.tech/) (búsqueda semántica, embeddings) |
| **Embeddings** | OpenAI `text-embedding-3-small` (opcional) |
| **Worker (jobs en background)** | Python, Redis, Celery (o similar) |
| **Webapp** | Next.js (en construcción) |
| **Base de datos relacional** | PostgreSQL (metadata, trazabilidad; no usada por el gateway para búsqueda) |
| **Cola de mensajes** | Redis |
| **Reverse proxy** | Nginx (cuando se usa el stack completo con Docker) |
| **Conversión HTML → texto** | [html-to-text](https://github.com/html-to-text/node-html-to-text) |

---

## Ejecución con Docker Compose

Para levantar **todo el stack** (Postgres, Redis, Qdrant, Gateway, Webapp, Nginx):

1. En la **raíz del repo** (donde está `docker-compose.yml`):
   ```powershell
   copy .env.example .env
   # Editar .env si necesitas cambiar Postgres, Redis, etc.
   docker compose up -d
   ```

2. Servicios y puertos:
   - **Postgres** → 5432  
   - **Redis** → 6379  
   - **Qdrant** → 6333  
   - **Nginx (webapp + API)** → 80  

3. URLs (con Nginx en marcha):
   | Qué | URL |
   |-----|-----|
   | Webapp | http://localhost |
   | Gateway health | http://localhost/api/health |
   | Búsqueda API | http://localhost/api/search?q=docs |

4. Si ya tienes otros contenedores usando 5432, 6379, 6333 o 80, deténlos antes (`docker compose down` en el otro proyecto).

---

## Ejecución sin Docker (solo MCP + Qdrant)

Para usar **solo el MCP en Cursor** (indexar y buscar documentación) no necesitas Postgres ni Redis.

1. **Levantar Qdrant** (por ejemplo con Docker):
   ```powershell
   docker run -d -p 6333:6333 qdrant/qdrant:v1.7.4
   ```

2. **Configurar el gateway**:
   ```powershell
   cd gateway
   copy .env.example .env
   # Editar gateway/.env: mínimo QDRANT_URL=http://localhost:6333
   npm install
   npm run build
   ```

3. **Cursor** arranca el servidor MCP según `.cursor/mcp.json`; no hace falta ejecutarlo a mano.

4. **(Opcional)** Supervisor (indexa inbox + SHARED_DIRS cada 2 min):
   ```powershell
   cd gateway
   node dist/supervisor.js
   ```
   O un solo ciclo: `node dist/supervisor.js --once`

---

## Herramientas MCP disponibles

El servidor MCP expone estas herramientas para el IDE (Cursor, VS Code, etc.):

| Herramienta | Descripción |
|-------------|-------------|
| **search_docs** | Búsqueda en la documentación indexada (Qdrant). Parámetros: `query`, `limit` (opcional). |
| **count_docs** | Cuenta documentos en la colección `mcp_docs`. |
| **analize_code** | Análisis de código con contexto desde la BD: `description`, opcional `component`, `project`, `limit`. |
| **index_url** | Indexa una URL (HTML → texto) en Qdrant. Parámetros: `url`. |
| **index_url_with_links** | Indexa una URL y hasta N enlaces del mismo dominio. Parámetros: `url`, `max_links` (opcional). |
| **index_site** | Crawl de un sitio (BFS) hasta un máximo de páginas. Parámetros: `url`, `max_pages` (opcional). |
| **mediawiki_login** | Inicia sesión en un sitio MediaWiki (token + cookies). Parámetros: `url`. Tras el login, **view_url** / **index_url** pueden acceder a páginas protegidas. |
| **view_url** | Muestra el contenido de una URL en Markdown (solo contenido principal; bloques de código con \`\`\`). Parámetros: `url`. |
| **list_url_links** | Lista subenlaces y archivos de una URL. Salida en Markdown. Parámetros: `url`. |
| **write_flow_doc** | Crea un markdown (nodo del mapa de flujos) y lo guarda en el inbox para indexar. Parámetros: `title`, `description`; opcionales: `files`, `functions`, `flow_summary`, `bug_id`, `project`. |
| **list_shared_dir** | Lista archivos en un directorio compartido. Parámetros: `relative_path` (opcional). |
| **read_shared_file** | Lee un archivo de un directorio compartido. Parámetros: `relative_path`. |

Documentación detallada de cada herramienta: **gateway/docs/tools/** (y menú en consola: `cd gateway && npm run tools`).

---

## Conectar el IDE (Cursor / VS Code)

1. **Abrir la carpeta del repo** en Cursor (la que contiene `gateway/` y `docker-compose.yml`).
2. **Build del gateway** (una vez, o tras cambios):
   ```powershell
   cd gateway
   npm run build
   ```
3. **Qdrant** en marcha en `http://localhost:6333` (p. ej. `docker run -d -p 6333:6333 qdrant/qdrant:v1.7.4`).
4. **Reiniciar Cursor** después de tocar `.cursor/mcp.json` para que cargue el servidor MCP.

La configuración MCP está en **`.cursor/mcp.json`** (servidor `mcp-knowledge-hub`).

---

## Estructura del proyecto

```
/gateway       → MCP Gateway (Node.js + TypeScript): servidor MCP, indexación, búsqueda Qdrant
/worker        → Worker en background (Python)
/webapp        → Webapp Next.js
/nginx         → Configuración del reverse proxy
/scripts       → Scripts de utilidad
/docs_repo     → Documentación versionada (origen de verdad)
/INDEX_INBOX   → Carpeta vigilada por el supervisor (indexa y borra)
```

---

## Variables de entorno

- **Raíz del repo (`.env`)**  
  Usadas por Docker Compose: Postgres, Redis, Qdrant, etc. Copiar desde `.env.example`.

- **Gateway (`gateway/.env`)**  
  Usadas por el servidor MCP y el supervisor. Ver **gateway/.env.example**.

| Variable | Uso |
|----------|-----|
| `QDRANT_URL` | URL de Qdrant (ej. `http://localhost:6333`) |
| `INDEX_INBOX_DIR` | Carpeta inbox (el supervisor indexa y borra) |
| `SHARED_DIRS` | Carpetas compartidas a indexar; formato `proyecto:ruta` o `ruta` |
| `INDEX_URL_USER` / `INDEX_URL_PASSWORD` | Login MediaWiki / Basic Auth para indexar URLs protegidas |
| `VIEW_URL_MAX_LENGTH` | Límite en bytes para view_url (default 10 MB) |

---

## Documentación de referencia

- **Indexación:** el supervisor revisa **INDEX_INBOX_DIR** y **SHARED_DIRS** cada 2 min; las URLs se indexan solo bajo demanda (herramientas **index_url**, **index_url_with_links**, **index_site**).
- **Login MediaWiki:** el gateway obtiene token vía API MediaWiki, hace `action=login` y guarda cookies para ese host. Probar: `cd gateway && npm run test-login [URL]`.
- **Scripts del gateway:** `npm run build`, `npm run supervisor`, `npm run mcp`, `npm run index-example`, `npm run tools` (menú de herramientas).
- **Documentación completa:** ver **docs_repo/** y **gateway/docs/tools/**.
