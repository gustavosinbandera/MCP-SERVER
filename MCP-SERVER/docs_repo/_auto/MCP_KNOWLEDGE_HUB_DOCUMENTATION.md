---
bug_id: ""
title: "MCP Knowledge Hub - Documentación Técnica Completa"
created_at: "2025-02-18"
author: "system"
source: "MCP_Knowledge_Hub_Master_Prompt"
status: "auto"
confidence: "high"
project: "mcp-knowledge-hub"
repo: "mcp-system"
branch: "main"
files_touched: []
areas: ["architecture", "devops", "documentation", "mcp"]
keywords: ["mcp", "gateway", "qdrant", "postgres", "redis", "traceability", "vector-search"]
---

# MCP Knowledge Hub - Documentación Técnica

Documento generado automáticamente para indexación en base de datos vectorial.
Permite acceso eficiente al proyecto y soporte para mejoras.

---

## FASE 0 — Skeleton Structure (Completada)

### Qué se creó
- Estructura de directorios según especificación del Master Prompt
- `docker-compose.yml` (placeholder para servicios)
- `.env.example` con variables para Postgres, Redis, Qdrant, Gateway, Webapp
- `README.md` con visión general del proyecto
- Directorios: `/gateway`, `/worker`, `/webapp`, `/nginx`, `/scripts`, `/docs_repo`
- Subdirectorios en `docs_repo`: `docs`, `bugs`, `_auto`, `flows`, `adr`, `company_projects`, `staging`, `inbox`, `processed`
- Plantilla de front-matter para documentos: `docs_repo/_auto/DOCUMENT_FRONT_MATTER_TEMPLATE.md`

### Cómo funciona
- `docs_repo` es la fuente única de verdad para documentación
- `.gitkeep` en directorios vacíos mantiene la estructura en Git
- Script de validación: `scripts/validate_phase0.ps1` verifica que existan todos los archivos y directorios requeridos

### Pruebas
- Ejecutar: `powershell -ExecutionPolicy Bypass -File scripts\validate_phase0.ps1`
- Resultado esperado: "Phase 0 validation PASSED" y exit code 0

---

## FASE 1 — Datastores (Qdrant + Postgres + Redis) (Completada)

### Qué se creó
- **Postgres 15 Alpine**: Base de datos para metadata y trace logs. Puerto 5432. Usuario `postgres`, contraseña `postgres`, DB `mcp_hub`.
- **Redis 7 Alpine**: Cola para jobs en background. Puerto 6379.
- **Qdrant v1.7.4**: Base de datos vectorial para búsqueda semántica. Puerto 6333.
- Volúmenes persistentes: `postgres_data`, `redis_data`, `qdrant_data`
- Healthchecks para cada servicio
- Script de validación: `scripts/validate_phase1.ps1`

### Cómo funciona
- `docker-compose.yml` define los tres servicios con healthchecks
- Variables en `.env`: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_URL`, `QDRANT_HOST`, `QDRANT_PORT`
- Postgres: `pg_isready` para healthcheck
- Redis: `redis-cli ping` para healthcheck
- Qdrant: verificación TCP en puerto 6333 (la imagen no incluye curl)

### Pruebas
1. Iniciar: `docker compose up -d` (desde la raíz del proyecto)
2. Ejecutar: `powershell -ExecutionPolicy Bypass -File scripts\validate_phase1.ps1`
3. Resultado esperado: "Phase 1 validation PASSED", Postgres/Redis/Qdrant OK

---

## FASE 2 — Git Docs Repo Initialization (Completada)

### Qué se creó
- `.gitignore` para excluir .env, node_modules, __pycache__, builds, etc.
- `docs_repo/README.md` describiendo la estructura
- Script de validación: `scripts/validate_phase2.ps1`

### Cómo funciona
- `docs_repo` es la fuente única de verdad para documentación
- Estructura versionada: docs, bugs, _auto, flows, adr, company_projects, staging, inbox, processed
- Para inicializar Git: ejecutar `git init` desde la raíz del proyecto

### Pruebas
1. Inicializar Git: `git init` (desde raíz)
2. Ejecutar: `powershell -ExecutionPolicy Bypass -File scripts\validate_phase2.ps1`
3. Resultado esperado: "Phase 2 validation PASSED"

---

## FASE 3 — Postgres Schema for Traceability (Completada)

### Qué se creó
- `scripts/sql/001_traceability_schema.sql`: esquema de trazabilidad
- Tabla `submissions`: developer_identity, bug_id, repo, project, branch, build, files_touched, document_hash, qdrant_point_id, created_at
- Tabla `trace_logs`: submission_id, action, payload (JSONB), created_at
- Índices para búsqueda por developer, bug_id, created_at, qdrant_point_id
- `scripts/run_migrations.ps1` y `scripts/validate_phase3.ps1`

### Cómo funciona
- Cada submission registra la identidad del desarrollador, bug, repo/proyecto, branch/build, archivos tocados, hash del documento y ID del punto en Qdrant
- trace_logs permite auditoría detallada con payload JSONB

### Pruebas
1. Aplicar migración: `Get-Content scripts\sql\001_traceability_schema.sql | docker exec -i mcp-postgres psql -U postgres -d mcp_hub`
2. Ejecutar: `powershell -ExecutionPolicy Bypass -File scripts\validate_phase3.ps1`

---

## FASE 4 — MCP Gateway Minimal Implementation (Completada)

### Qué se creó
- **gateway/**: Node.js + TypeScript + Express
- Endpoints: `GET /` (info), `GET /health` (health check)
- Tests con Jest + Supertest
- Dockerfile y servicio en docker-compose

### Cómo funciona
- Puerto por defecto 3001 (GATEWAY_PORT)
- `/health` retorna `{status, service, timestamp}`
- Tests: `npm test` en gateway/

### Pruebas
1. `cd gateway && npm install && npm run build && npm test`
2. O: `powershell -ExecutionPolicy Bypass -File scripts\validate_phase4.ps1`

---

## FASE 5 — Worker Validation + Commit + Index (Completada)

### Qué se creó
- **worker/worker.py**: validación de documentos, hash, recorrido de staging
- **worker/test_worker.py**: tests para validate_document, document_hash
- **worker/requirements.txt**: redis, qdrant-client, psycopg2-binary

### Cómo funciona
- `validate_document(path)`: verifica que el archivo existe y tiene contenido
- `document_hash(content)`: SHA256 del contenido
- `worker.py` recorre docs_repo/staging/*.md y valida

### Pruebas
- `cd worker && python -m pytest test_worker.py -v`
- `python worker.py` (smoke test)

---

## FASE 6 — Search Implementation with Qdrant (Completada)

### Qué se creó
- **gateway/src/search.ts**: integración con Qdrant
- Endpoint `GET /search?q=...&limit=10`
- Cliente `@qdrant/js-client-rest`

### Cómo funciona
- Conecta a Qdrant (QDRANT_URL, default localhost:6333)
- Colección `mcp_docs`
- Scroll de puntos, filtro por keyword en payload (title, content)

### Pruebas
- `cd gateway && npm test`
- Con Qdrant levantado: `GET http://localhost:3001/search?q=docs`

---

## FASE 7 — Webapp Minimal UI (Completada)

### Qué se creó
- **webapp/**: Next.js 14 + React
- Página con input de búsqueda que consume `GET /search` del Gateway
- Variable `NEXT_PUBLIC_GATEWAY_URL` para URL del gateway

### Cómo funciona
- Input + botón Buscar
- Llama a `{GATEWAY_URL}/search?q=...`
- Muestra resultados (title, content) de Qdrant

### Pruebas
- `cd webapp && npm run build` (en Linux/Docker)
- `npm run dev` para desarrollo local

---

## FASE 8 — Reverse Proxy + VPN Hardening (Completada)

### Qué se creó
- **nginx/nginx.conf**: proxy a gateway y webapp
- **nginx/Dockerfile**: imagen nginx:alpine
- Headers de seguridad: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection

### Cómo funciona
- Nginx escucha en puerto 80
- `/api/*` → gateway (health, search)
- `/` → webapp
- Postgres, Redis, Qdrant: solo `expose`, no `ports` en host (acceso solo entre contenedores)

### Pruebas
- `powershell -ExecutionPolicy Bypass -File scripts\validate_phase8.ps1`

---

## Estado actual (MCP, indexación, supervisor)

- **Gateway**: Solo usa **Qdrant** para el Knowledge Hub (búsqueda e indexación). **No** usa Postgres para búsqueda.
- **Postgres**: Usado por **worker** y **webapp** (metadata, trazabilidad). Necesario cuando se levanta el stack completo o se construye la webapp.
- **Supervisor** (`node dist/supervisor.js`): Cada 2 min (o `SUPERVISOR_INTERVAL_MS`) revisa **INDEX_INBOX_DIR** (indexa y borra) y **SHARED_DIRS** (indexa sin borrar). **No indexa URLs**; las URLs/sitios se indexan solo **bajo demanda** con las herramientas MCP `index_url`, `index_url_with_links`, `index_site`.
- **Herramientas MCP**: search_docs, count_docs, analize_code, index_url, index_url_with_links, index_site, list_shared_dir, read_shared_file, **list_url_links** (listar enlaces/archivos de una URL; salida Markdown), **view_url** (ver contenido de una URL en Markdown sin indexar). Variables del gateway en **gateway/.env** (ver **gateway/.env.example**). Raíz **.env** es para Docker (Postgres, Redis, etc.).

---

## Resumen

Todas las fases completadas. Documento listo para indexación en base de datos vectorial (Qdrant).
Palabras clave: mcp, gateway, qdrant, postgres, redis, worker, webapp, nginx, traceability, search.

