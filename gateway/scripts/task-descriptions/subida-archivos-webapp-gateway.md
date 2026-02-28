# Subida de archivos (webapp + gateway)

## Objetivo

Permitir subir archivos desde la webapp al **inbox** (para indexar y borrar) o al **KB (Knowledge Base)** persistente por usuario, con metadata de proyecto y fuente.

## Qué se hizo

### Gateway

- **Multer** para multipart en `POST /inbox/upload` y `POST /kb/upload`.
- **Config:** `MAX_UPLOAD_FILES`, `MAX_UPLOAD_TOTAL_BYTES` en `gateway/src/config.ts` (y env).
- **Helper de validación:** `gateway/src/inbox-upload.ts` — extensiones permitidas, path seguro, límites por archivo.
- **POST /inbox/upload:** escribe en `INDEX_INBOX_DIR`, devuelve JSON con rutas escritas.
- **POST /kb/upload:** solo `.md`; escribe en User KB (`USER_KB_ROOT_DIR/<userId>/`), frontmatter con `project`, `source`; registra en SQLite `kb_uploads` (tabla `kb_uploads`: user_id, project, file_path, source, created_at).
- **CORS** en el gateway para que la webapp en otro puerto pueda llamar a la API.

### Webapp

- **Página `/upload`** (`webapp/src/app/upload/page.tsx`):
  - Selector de destino: **Inbox** vs **KB**.
  - Campos: proyecto, usuario (userId), fuente (source).
  - Input file múltiple y opción **“Subir carpeta completa”** (`webkitdirectory`).
  - Validación en cliente: máximo 2 MB por archivo, máximo 50 archivos; aviso si se supera.
  - FormData a `/api/inbox/upload` o `/api/kb/upload` (o a `NEXT_PUBLIC_GATEWAY_URL` si está definido).
- **Enlace** “Subir al índice / KB” en la home y en la página de upload a `/upload`.

### Documentación

- **README:** sección “Webapp y puertos (desarrollo local)” con tabla Gateway (3001) / Webapp (3000), comandos `npm run dev`, `npm run dev:3002`, `npm run start`, y `NEXT_PUBLIC_GATEWAY_URL` en `webapp/.env.local`.
- URLs de desarrollo: logs en 3001, upload en 3000 (o 3002).

## Cómo usar

1. **Desarrollo local:** Gateway en 3001, webapp en 3000 (o 3002 con `npm run dev:3002`). En `webapp/.env.local`: `NEXT_PUBLIC_GATEWAY_URL=http://localhost:3001`.
2. **Producción (Docker):** Nginx sirve `/` a la webapp y `/api/` al gateway; la página `/upload` llama a `/api/inbox/upload` y `/api/kb/upload`.

## Archivos relevantes

- `gateway/src/config.ts` — límites y rutas (inbox, USER_KB).
- `gateway/src/inbox-upload.ts` — validación y sanitización.
- `gateway/src/kb-uploads-db.ts` — SQLite kb_uploads.
- `gateway/src/user-kb.ts` — `writeUploadedKbDoc`.
- `gateway/src/index.ts` — rutas `/inbox/upload`, `/kb/upload` y CORS.
- `webapp/src/app/upload/page.tsx` — UI de subida.
- `webapp/src/app/page.tsx` — enlace a `/upload`.
