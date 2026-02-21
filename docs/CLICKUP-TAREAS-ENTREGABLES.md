# Tareas ClickUp – Entregables MCP-SERVER (trabajo realizado)

Listado de tareas para registrar en ClickUp el trabajo ya realizado. Todas asignadas al único desarrollador. Flujo por tarea: **Crear** → **Poner en EN CURSO** → **Documentar en la tarea** (rellenar descripción/subtareas) → **Mover a COMPLETADAS**.

---

## 1. Infraestructura (CloudFormation y EC2)

### 1.1 CloudFormation: stack EC2 y Security Group

**Descripción (plantilla Markdown para rellenar en la tarea):**

```markdown
## Qué se hizo
Stack CloudFormation para instancia EC2 y Security Group (SSH, HTTP, HTTPS).

## Código / archivos
- `infra/mcp-ec2.yaml` – plantilla
- `infra/1-create-stack.ps1`, `2-get-outputs.ps1`, `3-delete-stack.ps1` – scripts
- Parámetros y outputs (IP, InstanceId)

## Cómo usar
Orden de ejecución: 1-create-stack → 2-get-outputs (obtener IP) → 3-delete-stack para eliminar.

## Cómo testear
Crear stack, ver outputs; eliminar stack y comprobar que se borra.
```

**Subtareas sugeridas (al pasar a En progreso):** Código: mcp-ec2.yaml y scripts 1–3; Documentación: qué hace cada script; Cómo usar: orden y parámetros; Cómo testear: crear/eliminar stack y ver outputs.

---

### 1.2 Setup remoto EC2: Docker y proyecto

**Descripción (plantilla):**

```markdown
## Qué se hizo
Script para configurar la instancia EC2: instalación Docker en Amazon Linux, clonado/copia del proyecto, `docker compose up -d`.

## Código / archivos
- `infra/4-setup-remote.ps1`

## Cómo usar
Ejecutar desde local contra la IP de la instancia (SSH). Requiere clave y acceso SSH.

## Cómo testear
SSH a la instancia y comprobar que los servicios están levantados.
```

**Subtareas sugeridas:** Código: 4-setup-remote.ps1; Documentación: pasos y requisitos SSH; Cómo usar: ejecutar desde local contra IP; Cómo testear: SSH y comprobar servicios.

---

### 1.3 Route53: registro mcp y actualización de IP

**Descripción (plantilla):**

```markdown
## Qué se hizo
Registro DNS (Route53) para dominio mcp (ej. mcp.domoticore.co) apuntando a la IP del stack.

## Código / archivos
- `infra/5-route53-mcp.ps1`, `route53-mcp-record.json`

## Cómo usar
Ejecutar después de crear el stack; obtener hosted zone id desde la consola AWS.

## Cómo testear
Comprobar que el DNS resuelve a la IP de la instancia.
```

**Subtareas sugeridas:** Código: 5-route53-mcp.ps1 y JSON; Documentación: cómo obtener hosted zone id; Cómo usar: después de crear stack; Cómo testear: DNS resuelve a la IP.

---

### 1.4 Util scripts EC2: update-repo e instalación

**Descripción (plantilla):**

```markdown
## Qué se hizo
Scripts de utilidad en la instancia: update-repo (pull, build, restart), install-tools.sh (PATH y aliases en `/opt/mcp-tools`).

## Código / archivos
- `scripts/ec2/util_update_repo`, `install-tools.sh`

## Cómo usar
En EC2: `update-repo` tras hacer pull; ver COMANDOS-INSTANCIA-EC2 sección "Util scripts".

## Cómo testear
Ejecutar en EC2 y comprobar que el reinicio de servicios se realiza correctamente.
```

**Subtareas sugeridas:** Código: util_update_repo, install-tools.sh; Documentación: COMANDOS-INSTANCIA-EC2 "Util scripts"; Cómo usar: update-repo tras pull; Cómo testear: ejecutar en EC2 y ver reinicio.

---

## 2. Indexación de datos

### 2.1 INDEX_INBOX y processInbox

**Descripción (plantilla):**

```markdown
## Qué se hizo
Supervisor procesa carpeta INDEX_INBOX: chunking, embeddings, upsert en Qdrant; luego borra/mueve archivos.

## Código / archivos
- `inbox-indexer.ts`, `supervisor.ts`

## Cómo usar
Poner archivos en INDEX_INBOX; el supervisor los indexa en el siguiente ciclo.

## Cómo testear
Revisar logs y usar count_docs para verificar documentos indexados.
```

**Subtareas sugeridas:** Código: inbox-indexer, supervisor; Documentación: REVISION-INDEXADOR; Cómo usar: poner archivos en INDEX_INBOX; Cómo testear: logs y count_docs.

---

### 2.2 SHARED_DIRS y one-time (classic, blueivory)

**Descripción (plantilla):**

```markdown
## Qué se hizo
Carpetas compartidas classic/blueivory: indexación por ciclo; one-time en SQLite para no reindexar ya indexado.

## Código / archivos
- `shared-dirs.ts`, `one-time-indexed-db.ts`

## Cómo usar
Configurar SHARED_DIRS en .env; el supervisor indexa en cada ciclo.

## Cómo testear
shared-dirs.test.ts y ejecutar ciclo del supervisor.
```

**Subtareas sugeridas:** Código: shared-dirs, one-time-indexed-db; Documentación: SHARED-DIRS-VS-ONE-TIME; Cómo usar: SHARED_DIRS en .env; Cómo testear: shared-dirs.test.ts y ciclo supervisor.

---

### 2.3 Indexación por URL (index_url, index_site)

**Descripción (plantilla):**

```markdown
## Qué se hizo
Herramientas MCP y módulo para indexar una URL o un sitio completo; opción render_js; límite de páginas.

## Código / archivos
- `url-indexer.ts`, mcp-server (index_url, index_site)

## Cómo usar
Desde MCP: index_url / index_site con la URL y parámetros.

## Cómo testear
Indexar una URL y buscar con search_docs.
```

**Subtareas sugeridas:** Código: url-indexer, mcp-server (index_url, index_site); Documentación: gateway/docs/tools; Cómo usar: MCP index_url / index_site; Cómo testear: indexar URL y buscar.

---

### 2.4 Estadísticas de indexación por día (SQLite)

**Descripción (plantilla):**

```markdown
## Qué se hizo
Estadísticas diarias de indexación (inbox, shared_new, shared_reindexed, url) en SQLite; endpoint GET /stats/indexing; logs indexing_daily.

## Código / archivos
- `indexing-stats.ts`, index.ts, supervisor

## Cómo usar
GET /stats/indexing?days=7 (o el número de días deseado).

## Cómo testear
indexing-stats.test.ts.
```

**Subtareas sugeridas:** Código: indexing-stats, index.ts, supervisor; Documentación: REVISION-INDEXADOR o API; Cómo usar: GET /stats/indexing?days=7; Cómo testear: indexing-stats.test.ts.

---

### 2.5 Chunking y code-metadata

**Descripción (plantilla):**

```markdown
## Qué se hizo
Fragmentación de texto y código; metadatos para código (clases, archivo).

## Código / archivos
- `chunking.ts`, `code-chunking.ts`, `code-metadata.ts`

## Cómo usar
Usado internamente por el indexador.

## Cómo testear
chunking.test.ts, code-chunking.test.ts, code-metadata.test.ts.
```

**Subtareas sugeridas:** Código: chunking, code-chunking, code-metadata; Documentación: SUGERENCIAS-INDEXACION; Cómo usar: usado por indexador; Cómo testear: los tres archivos .test.ts.

---

### 2.6 Embeddings y búsqueda semántica

**Descripción (plantilla):**

```markdown
## Qué se hizo
OpenAI embeddings, búsqueda por similitud en Qdrant; filtros opcionales.

## Código / archivos
- `embedding.ts`, `search.ts`, `qdrant-client.ts`

## Cómo usar
Herramienta MCP search_docs con query y filtros.

## Cómo testear
embedding.test.ts, search.test.ts.
```

**Subtareas sugeridas:** Código: embedding, search, qdrant-client; Documentación: CHECKLIST-semantica-openai; Cómo usar: search_docs MCP; Cómo testear: embedding.test.ts, search.test.ts.

---

## 3. Gateway MCP (herramientas y servicios)

### 3.1 Herramientas de búsqueda (search_docs, count_docs)

**Descripción (plantilla):**

```markdown
## Qué se hizo
Búsqueda semántica y conteo de puntos en Qdrant; filtros por project, branch, etc.

## Código / archivos
- mcp-server (search_docs, count_docs), search.ts

## Cómo usar
Desde Cursor / usar MCP: invocar search_docs o count_docs.

## Cómo testear
search.test.ts.
```

**Subtareas sugeridas:** Código: mcp-server (search_docs, count_docs), search; Documentación: gateway/docs/tools; Cómo usar: desde Cursor/usar-mcp; Cómo testear: search.test.ts.

---

### 3.2 Herramientas de indexación y view_url

**Descripción (plantilla):**

```markdown
## Qué se hizo
index_url, index_site, index_url_with_links; view_url con opción render_js (Puppeteer).

## Código / archivos
- mcp-server, url-indexer, fetch-with-browser

## Cómo usar
Herramientas MCP desde el cliente.

## Cómo testear
index.test.ts y pruebas manuales.
```

**Subtareas sugeridas:** Código: mcp-server, url-indexer, fetch-with-browser; Documentación: tools/index_url, view_url; Cómo usar: MCP; Cómo testear: index.test.ts y pruebas manuales.

---

### 3.3 ClickUp: cliente API y 8 herramientas MCP

**Descripción (plantilla):**

```markdown
## Qué se hizo
Cliente ClickUp API v2 y 8 herramientas MCP: list_workspaces, list_spaces, list_folders, list_lists, list_tasks, create_task, get_task, update_task.

## Código / archivos
- `clickup-client.ts`, mcp-server (clickup_*)

## Cómo usar
CLICKUP_API_TOKEN en .env; invocar herramientas desde MCP.

## Cómo testear
create-clickup-example-task.cjs.
```

**Subtareas sugeridas:** Código: clickup-client, mcp-server (clickup_*); Documentación: CLICKUP-API-REFERENCE; Cómo usar: CLICKUP_API_TOKEN y MCP; Cómo testear: create-clickup-example-task.cjs.

---

### 3.4 Repo/git y búsqueda GitHub

**Descripción (plantilla):**

```markdown
## Qué se hizo
Herramientas repo_git y search_github_repos para operaciones git y búsqueda en GitHub.

## Código / archivos
- `repo-git.ts`, `github-search.ts`, mcp-server

## Cómo usar
Desde MCP con los parámetros documentados en tools.

## Cómo testear
Manual o tests si existen.
```

**Subtareas sugeridas:** Código: repo-git, github-search, mcp-server; Documentación: tools/repo_git, search_github_repos; Cómo usar: MCP; Cómo testear: manual o tests.

---

### 3.5 Shared dirs: list_shared_dir, read_shared_file

**Descripción (plantilla):**

```markdown
## Qué se hizo
Listar y leer archivos de carpetas compartidas (classic, blueivory).

## Código / archivos
- mcp-server, shared-dirs

## Cómo usar
Herramientas MCP list_shared_dir y read_shared_file.

## Cómo testear
shared-dirs.test.ts.
```

**Subtareas sugeridas:** Código: mcp-server, shared-dirs; Documentación: tools; Cómo usar: MCP; Cómo testear: shared-dirs.test.ts.

---

## 4. Tests (una task por suite)

Para cada task de test, al pasar a "En progreso": (1) Código: archivo X; (2) Qué valida; (3) Cómo ejecutar: `npm run test -- <archivo>`; (4) Criterio "Completado": todos los tests pasan.

### 4.1 Tests: chunking

**Descripción (plantilla):**

```markdown
## Qué valida
Fragmentación de texto (tamaño, solapamiento, límites).

## Código
`chunking.test.ts`

## Cómo ejecutar
`npm run test -- chunking.test.ts`

## Completado
Todos los tests pasan.
```

---

### 4.2 Tests: code-chunking

**Descripción (plantilla):** Chunking de código (funciones, clases). Archivo: `code-chunking.test.ts`. Ejecutar: `npm run test -- code-chunking.test.ts`. Completado: tests pasan.

---

### 4.3 Tests: code-metadata

**Descripción (plantilla):** Extracción de nombres de clase y tipos referenciados. Archivo: `code-metadata.test.ts`. Ejecutar: `npm run test -- code-metadata.test.ts`. Completado: tests pasan.

---

### 4.4 Tests: config

**Descripción (plantilla):** Carga de configuración desde env. Archivo: `config.test.ts`. Ejecutar: `npm run test -- config.test.ts`. Completado: tests pasan.

---

### 4.5 Tests: embedding

**Descripción (plantilla):** Generación de embeddings (mock o clave). Archivo: `embedding.test.ts`. Ejecutar: `npm run test -- embedding.test.ts`. Completado: tests pasan.

---

### 4.6 Tests: flow-doc

**Descripción (plantilla):** Flujo de documentos. Archivo: `flow-doc.test.ts`. Ejecutar: `npm run test -- flow-doc.test.ts`. Completado: tests pasan.

---

### 4.7 Tests: index (gateway)

**Descripción (plantilla):** Rutas HTTP del gateway. Archivo: `index.test.ts`. Ejecutar: `npm run test -- index.test.ts`. Completado: tests pasan.

---

### 4.8 Tests: indexed-keys-db

**Descripción (plantilla):** DB de claves indexadas. Archivo: `indexed-keys-db.test.ts`. Ejecutar: `npm run test -- indexed-keys-db.test.ts`. Completado: tests pasan.

---

### 4.9 Tests: indexing-stats

**Descripción (plantilla):** Estadísticas por día (SQLite). Archivo: `indexing-stats.test.ts`. Ejecutar: `npm run test -- indexing-stats.test.ts`. Completado: tests pasan.

---

### 4.10 Tests: logger

**Descripción (plantilla):** Logger. Archivo: `logger.test.ts`. Ejecutar: `npm run test -- logger.test.ts`. Completado: tests pasan.

---

### 4.11 Tests: search

**Descripción (plantilla):** Búsqueda semántica y filtros. Archivo: `search.test.ts`. Ejecutar: `npm run test -- search.test.ts`. Completado: tests pasan.

---

### 4.12 Tests: shared-dirs

**Descripción (plantilla):** Resolución de directorios compartidos. Archivo: `shared-dirs.test.ts`. Ejecutar: `npm run test -- shared-dirs.test.ts`. Completado: tests pasan.

---

## 5. Documentación

### 5.1 Doc: CLICKUP-API-REFERENCE

**Descripción (plantilla):** Referencia API ClickUp (auth, endpoints, errores). Archivo: `docs/CLICKUP-API-REFERENCE.md`. Subtareas: Código: archivo; Qué cubre: auth, /team, /space, /folder, /list, /task; Cómo usar: consulta al integrar ClickUp.

---

### 5.2 Doc: COMANDOS-INSTANCIA-EC2

**Descripción (plantilla):** Comandos SSH, servicios, logs, reinicio, Qdrant, SQLite, ClickUp token. Archivo: `docs/COMANDOS-INSTANCIA-EC2.md`. Subtareas: Código: archivo; Qué cubre: conexión, docker compose, logs, util scripts; Cómo usar: operación diaria en EC2.

---

### 5.3 Doc: SYNC-Y-INDEXACION-DEPLOYS

**Descripción (plantilla):** Sincronización de código e indexación en deploys. Archivo: `docs/SYNC-Y-INDEXACION-DEPLOYS.md`. Subtareas: Código: docs; Qué cubre: flujo sync e indexación; Cómo usar: guía de despliegue.

---

### 5.4 Doc: REVISION-INDEXADOR y SUGERENCIAS-INDEXACION

**Descripción (plantilla):** Revisión del indexador y sugerencias (metadata, chunking). Archivos en `gateway/docs/`. Subtareas: Código: REVISION-INDEXADOR, SUGERENCIAS-INDEXACION; Qué cubre: arquitectura indexador; Cómo usar: referencia para cambios.

---

### 5.5 Doc: Herramientas MCP (tools/)

**Descripción (plantilla):** Documentación por herramienta en `gateway/docs/tools/`. Subtareas: Código: README y archivos por herramienta; Qué cubre: parámetros y ejemplos; Cómo usar: referencia para usuarios del MCP.

---

### 5.6 Doc: TESTING y validación por fases

**Descripción (plantilla):** `gateway/docs/TESTING.md` y scripts `validate_phase*.ps1`, `validate_all.ps1`. Subtareas: Código: TESTING.md, scripts; Qué cubre: cómo escribir y ejecutar tests; Cómo usar: CI o local.

---

## 6. Docker y servicios

### 6.1 Docker Compose: definición de servicios

**Descripción (plantilla):**

```markdown
## Qué se hizo
Definición de servicios: postgres, redis, qdrant, influxdb, grafana, gateway, supervisor, webapp, nginx.

## Código / archivos
- `docker-compose.yml`, Dockerfiles

## Cómo usar
`docker compose up -d`

## Cómo testear
Comprobar que los servicios están healthy.
```

**Subtareas sugeridas:** Código: docker-compose.yml, Dockerfiles; Documentación: qué hace cada servicio; Cómo usar: docker compose up -d; Cómo testear: servicios healthy.

---

### 6.2 Migraciones y arranque de datastores

**Descripción (plantilla):**

```markdown
## Qué se hizo
Scripts run_migrations.ps1, start_datastores.ps1; esquema SQL en scripts/sql/.

## Código / archivos
- scripts y SQL

## Cómo usar
Ejecutar antes de gateway/supervisor (orden de arranque).

## Cómo testear
Postgres/Redis/Qdrant accesibles.
```

**Subtareas sugeridas:** Código: scripts y SQL; Documentación: orden de arranque; Cómo usar: antes de gateway/supervisor; Cómo testear: datastores accesibles.

---

## Resumen

| Área           | Cantidad |
|----------------|----------|
| Infraestructura| 4        |
| Indexación     | 6        |
| Gateway MCP    | 5        |
| Tests          | 12       |
| Documentación  | 6        |
| Docker         | 2        |
| **Total**      | **35**   |

Crear todas las tareas en la lista elegida (Proyecto 1 o "Entregables MCP-SERVER"), asignadas al único desarrollador. Luego, una a una: **EN CURSO** → rellenar descripción/subtareas con lo hecho → **COMPLETADAS**.
