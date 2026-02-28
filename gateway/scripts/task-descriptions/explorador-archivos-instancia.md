# Explorador de archivos de la instancia

## Objetivo

Mostrar el sistema de archivos de la máquina o instancia de forma gráfica, tipo Windows Explorer, desde la webapp.

## Qué se hizo

### Gateway

- **Config:** `getFilesExplorerRoot()` en `gateway/src/config.ts` — raíz del explorador (env `FILES_EXPLORER_ROOT`; por defecto raíz del proyecto).
- **GET /files/list?path=...** en `gateway/src/index.ts`:
  - `path` relativo a esa raíz; no se permite salir con `..`.
  - Respuesta: `{ root: '.', path, entries: [{ name, path, isDir, size?, mtime? }] }`.
  - Carpetas primero, luego archivos; orden alfabético.
- **CORS** para que la webapp en otro puerto pueda llamar al gateway.

### Webapp

- **Página `/files`** (`webapp/src/app/files/page.tsx`):
  - **Breadcrumb:** “Raíz” y segmentos de ruta clicables.
  - **Tabla tipo Explorer:** icono (carpeta/archivo), nombre, tamaño, fecha de modificación.
  - Clic en una carpeta → navega a esa ruta y vuelve a pedir la lista al gateway.
- Enlaces a “Explorador de archivos” desde la home y desde `/upload`.

### Documentación

- **README:** tabla de URLs con `/files` y `/api/files/list?path=`, variable `FILES_EXPLORER_ROOT` en “Variables de entorno” y en la sección “Webapp y puertos”.

## Cómo usar

1. **Desarrollo local:** Gateway en 3001, webapp en 3000. Abrir `http://localhost:3000/files`. Si la webapp usa otro puerto (p. ej. 3002), usar ese.
2. **Producción (Docker):** Abrir `http://localhost/files` (o la URL del host). La página llama a `/api/files/list`; nginx reenvía al gateway.
3. **Raíz del explorador:** Por defecto es la raíz del proyecto. En la instancia/Docker puede configurarse con `FILES_EXPLORER_ROOT` en el `.env` del gateway.

## Archivos relevantes

- `gateway/src/config.ts` — `getFilesExplorerRoot()`.
- `gateway/src/index.ts` — `resolveExplorerPath()`, `GET /files/list`.
- `webapp/src/app/files/page.tsx` — UI del explorador.
- `webapp/src/app/page.tsx` y `webapp/src/app/upload/page.tsx` — enlaces a `/files`.
