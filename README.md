# MCP Knowledge Hub

Gateway MCP con búsqueda vectorial (Qdrant), indexación de documentación, webapp tipo ChatGPT y trazabilidad.

**Página de presentación:** si tienes [GitHub Pages](https://docs.github.com/en/pages) activado desde la carpeta `docs/`, la página está en **https://gustavosinbandera.github.io/MCP-SERVER/** (diagrama de arquitectura, tecnologías e infraestructura).

**Diagrama de infraestructura para el equipo:** [docs/INFRAESTRUCTURA.md](docs/INFRAESTRUCTURA.md) (servicios, puertos, EC2, Mermaid + SVG).

---

## Índice (navegación)

- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Ejecución con Docker Compose](#ejecución-con-docker-compose)
- [Ejecución sin Docker (solo MCP + Qdrant)](#ejecución-sin-docker-solo-mcp--qdrant)
- [Webapp y puertos (desarrollo local)](#webapp-y-puertos-desarrollo-local)
- [Ejecución de tests por fases](#ejecución-de-tests-por-fases)
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

## Webapp y puertos (desarrollo local)

En desarrollo local hay **dos servidores** con puertos por defecto distintos:

| Servidor | Puerto por defecto | Variable de entorno | Qué sirve |
|----------|--------------------|---------------------|-----------|
| **Gateway (Express)** | **3001** | `GATEWAY_PORT` | `/health`, `/logs/view`, `/inbox/upload`, `/kb/upload`, APIs de búsqueda, etc. |
| **Webapp (Next.js)** | **3000** | — | `/` (home), `/upload` (subida a inbox/KB) |

- **Web de logs:** si el gateway está en marcha en 3001 → **http://localhost:3001/logs/view**
- **Página de upload:** hay que levantar la webapp → **http://localhost:3000/upload** (o el puerto que uses).

**Levantar la webapp:**

```powershell
cd webapp
npm install
npm run build          # solo si vas a usar npm run start
npm run dev            # desarrollo en http://localhost:3000
# o, para no usar el 3000:
npm run dev:3002       # desarrollo en http://localhost:3002
# producción (tras npm run build):
npm run start          # sirve en http://localhost:3000
```

**Que el formulario de upload llame al gateway:** crea `webapp/.env.local` (puedes copiar de `webapp/.env.local.example`) con:

```env
NEXT_PUBLIC_GATEWAY_URL=http://localhost:3001
```

Así la página `/upload` usará el gateway en 3001 para las APIs de subida (inbox y KB).

**Resumen de URLs (desarrollo local):**

| Qué | URL |
|-----|-----|
| Logs (gateway) | http://localhost:3001/logs/view |
| Home webapp | http://localhost:3000/ |
| Upload (webapp) | http://localhost:3000/upload |
| Explorador de archivos (webapp) | http://localhost:3000/files |
| Health gateway | http://localhost:3001/health |
| Listar directorio (API) | http://localhost:3001/files/list?path= |

Si usas `npm run dev:3002`, sustituye 3000 por 3002 en las URLs de la webapp.

**Explorador de archivos:** la página `/files` muestra el sistema de archivos de la instancia (tipo Windows Explorer). La raíz se configura en el gateway con la variable **`FILES_EXPLORER_ROOT`** (por defecto: raíz del proyecto). Solo se pueden listar rutas bajo esa raíz.

---

## Ejecución de tests por fases

El proyecto incluye un **sistema de validación por fases** (scripts en `scripts/`). Cada fase comprueba una parte del stack; puedes ejecutar una fase concreta o todas en secuencia.

**Requisitos:** PowerShell. Para fases que usan Docker (1, 3, 5), tener el stack levantado cuando corresponda (`docker compose up -d`).

| Fase | Qué valida |
|------|------------|
| **0** | Estructura del repo: `docker-compose.yml`, `.env.example`, `README.md`, carpetas `gateway/`, `worker/`, `webapp/`, `nginx/`, `scripts/`, `docs_repo/` y subcarpetas. |
| **1** | Datastores: Postgres (`mcp-postgres`), Redis (`mcp-redis`) y Qdrant (http://localhost:6333) en marcha y accesibles. |
| **2** | Git y `docs_repo`: que existan `docs_repo/`, subdirs y `docs_repo/README.md`. |
| **3** | Esquema Postgres: tablas `submissions` y `trace_logs` en `mcp_hub` (migración `scripts/sql/001_traceability_schema.sql`). |
| **4** | Gateway MCP: `npm install`, `npm run build` y `npm test` en `gateway/`. |
| **5** | Worker: pytest y smoke del worker dentro del contenedor (`docker compose run --rm worker ...`). |
| **6** | Búsqueda con Qdrant: build y tests del gateway que verifican la integración con Qdrant. |
| **7** | Webapp: `npm install` y `npm run build` en `webapp/`. |
| **8** | Nginx: existencia de `nginx/nginx.conf` con `proxy_pass` y cabeceras de seguridad (p. ej. `X-Frame-Options`). |

**Ejecutar una fase concreta** (desde la raíz del repo):

```powershell
.\scripts\validate_phase0.ps1   # solo fase 0
.\scripts\validate_phase1.ps1   # solo fase 1 (requiere docker compose up -d)
# ... validate_phase2.ps1 .. validate_phase8.ps1
```

**Ejecutar todas las fases en orden** (0 → 8):

```powershell
.\scripts\validate_all.ps1
```

Si una fase falla, `validate_all.ps1` se detiene y devuelve código de salida 1. Para la fase 3, si Postgres no está disponible, el script muestra un aviso y sale con 0; aplica la migración cuando tengas el contenedor en marcha:

```powershell
Get-Content scripts\sql\001_traceability_schema.sql | docker exec -i mcp-postgres psql -U postgres -d mcp_hub
```

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
| **repo_git** | Manipula el repositorio Git del workspace. Alias: hacer push, commit, subir cambios. Parámetros: `action` (status \| add \| commit \| push \| pull), `message` (obligatorio si action=commit), opcional `directory`, opcional `paths` (para add). |
| **search_github_repos** | Busca repositorios en GitHub por tema. Devuelve repos con temas acordes, ordenados por actualidad (updated) o por mejor puntuación (stars). Parámetros: `topic` (tema específico), opcional `limit` (máx. 30), opcional `sort` (updated \| stars \| forks). |

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
| `FILES_EXPLORER_ROOT` | Raíz del explorador de archivos (GET /files/list). Por defecto: raíz del proyecto. |

---

## Documentación de referencia

- **Indexación:** el supervisor revisa **INDEX_INBOX_DIR** y **SHARED_DIRS** cada 2 min; las URLs se indexan solo bajo demanda (herramientas **index_url**, **index_url_with_links**, **index_site**).
- **Login MediaWiki:** el gateway obtiene token vía API MediaWiki, hace `action=login` y guarda cookies para ese host. Probar: `cd gateway && npm run test-login [URL]`.
- **Scripts del gateway:** `npm run build`, `npm run supervisor`, `npm run mcp`, `npm run index-example`, `npm run tools` (menú de herramientas).
- **Documentación completa:** ver **docs_repo/** y **gateway/docs/tools/**.

---

## Página de presentación (GitHub Pages)

En el repo hay una página web en **`docs/index.html`** con diagrama de la infraestructura MCP, tecnologías y enlaces al README. Para publicarla:

1. En GitHub: **Settings** → **Pages**.
2. En **Build and deployment** → **Source**: elige **Deploy from a branch**.
3. **Branch:** `master` (o `main`).
4. **Folder:** `/docs`.
5. Guarda. La página quedará en `https://<usuario>.github.io/MCP-SERVER/`.
