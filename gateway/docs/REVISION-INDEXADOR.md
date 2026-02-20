# Revisión final del indexador – checklist

**Objetivo:** Confirmar que el indexador va a indexar como se espera (classic, blueivory, inbox) y no se pierde tiempo ni dinero (OpenAI, Qdrant).

---

## 1. Rutas y configuración

| Item | Estado | Detalle |
|------|--------|---------|
| **INDEX_INBOX** | OK | Por defecto: `getProjectRoot()/INDEX_INBOX`. Si no existe, se crea en el primer ciclo. |
| **SHARED_DIRS** | OK | Formato `proyecto:ruta`. Rutas **relativas** (ej. `classic`, `blueivory`) se resuelven contra **project root** (`config.getProjectRoot()` = padre de `gateway/`). |
| **classic / blueivory** | OK | Con `SHARED_DIRS=classic:classic;blueivory:blueivory` se indexan las carpetas `MCP-SERVER/classic` y `MCP-SERVER/blueivory`. |
| **Docker (EC2)** | OK | En `docker-compose.yml` el gateway tiene volúmenes: `./classic:/app/classic`, `./blueivory:/app/blueivory`, `./INDEX_INBOX:/app/INDEX_INBOX`. Así el contenedor ve las carpetas del host; con `SHARED_DIRS=classic:classic;blueivory:blueivory` indexa correctamente en local y en la EC2. |

---

## 2. Extensiones indexadas (TEXT_EXT)

Se indexan como texto (y se envían a embeddings si hay `OPENAI_API_KEY`):

- **C/C++:** `.cpp`, `.h`, `.hpp`, `.c`, `.cc`, `.cxx`
- **C#:** `.cs`, `.cshtml`, `.razor`
- **JS/TS:** `.js`, `.ts`, `.mjs`, `.cjs`
- **Python, etc.:** `.py`, `.rb`, `.go`, `.rs`, `.java`, `.kt`, `.scala`
- **Scripts:** `.sh`, `.bash`, `.ps1`, `.sql`
- **Docs:** `.txt`, `.md`, `.json`, `.csv`, `.html`, `.xml`, `.log`, `.yml`, `.yaml`

Archivos con otras extensiones **no** se indexan (se ignoran). Binarios y comprimidos están en **BLOCKED_EXT** (`.exe`, `.dll`, `.zip`, etc.).

---

## 3. Directorios ignorados

Por defecto no se recorren: `.git`, `node_modules`, `__pycache__`, `.venv`, `venv`, `dist`, `build`, `out`, `.next`, `target`, `.idea`, `.vscode`, `.cursor`, `tmp`, `temp`, etc. Así se evita indexar dependencias y artefactos de build. Configurable con `INDEX_IGNORE_DIRS` si hace falta.

---

## 4. Límites (coste y tamaño)

| Límite | Valor | Efecto |
|--------|--------|--------|
| **MAX_FILE_SIZE_BYTES** | 2 MB | Archivos mayores no se leen (se omiten sin error). |
| **INDEX_CONCURRENCY** | 5 (default), máx 20 | Operaciones de indexación en paralelo; limita picos a OpenAI/Qdrant. |
| **Chunking** | ~2400 chars/chunk, overlap 200 | Documentos largos se parten en trozos; cada trozo = una llamada a embeddings. |
| **Chunking código** | Mismo tamaño ± margen (~600 chars) | Para C/C++, C#, JS/TS, Java, Go, Rust, etc. el corte se hace en **límites de código**: fin de función/clase (brace depth 0), `#endif`, `#endregion`. Así no se corta en medio de una función o directiva. |
| **OPENAI_API_KEY** | Opcional | Si **no** está definida, no se llama a embeddings (vector = [0]); no hay coste OpenAI pero la búsqueda es solo por keywords. |

Para no gastar de más: conviene tener `OPENAI_API_KEY` solo cuando quieras búsqueda semántica; el tamaño máximo por archivo (2 MB) ya evita archivos enormes.

---

## 5. Metadatos de código (class_names, file_name, etc.)

Para **C#** (`.cs`), **TypeScript/JavaScript** (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`) y **Java** (`.java`) se extraen:

- `file_name`, `class_names`, `property_names`, `referenced_types`

y se guardan en el payload de Qdrant. Así se puede filtrar búsqueda por clase, tipo referenciado, etc. Los `.cshtml` y `.razor` se indexan como texto pero **no** pasan por `extractCodeMetadata` (no están en `CODE_EXTS`); es aceptable porque son mezcla de markup y código.

---

## 6. Flujo del supervisor

1. **processInbox()** – Lee `INDEX_INBOX`, indexa cada archivo/carpeta y **los borra** después de indexar.
2. **indexSharedDirs()** – Para cada entrada de `SHARED_DIRS`, recorre la carpeta, indexa solo archivos con extensión en TEXT_EXT, **no borra nada** en disco. Opcionalmente reindexa si el contenido cambió (hash) con `INDEX_SHARED_REINDEX_CHANGED=true`, y borra de Qdrant los documentos cuyo archivo ya no existe con `INDEX_SHARED_SYNC_DELETED=true`.

El indexador **no elimina** archivos de classic/blueivory; solo los lee y actualiza Qdrant.

---

## 6.1 Control para no reindexar desde la VM

Por defecto **no se reindexa** lo que ya está en Qdrant. En cada ciclo el indexador:

1. Carga las claves ya indexadas desde Qdrant (o desde el índice persistente SQLite si `INDEX_USE_PERSISTENT_KEYS=true`).
2. Solo indexa archivos cuyo `(proyecto, ruta)` **no está** en esa lista → archivos **nuevos**.
3. Los archivos ya indexados **no se vuelven a indexar** a menos que actives reindexado por cambios.

Variables opcionales (en la VM no hace falta definirlas si quieres evitar reindexar):

| Variable | Efecto si no se define (o `false`) | Efecto si `true` |
|----------|-------------------------------------|------------------|
| **INDEX_SHARED_REINDEX_CHANGED** | No reindexa archivos existentes aunque hayan cambiado. | Reindexa solo los archivos cuyo contenido cambió (por hash). |
| **INDEX_SHARED_SYNC_DELETED** | No borra de Qdrant documentos cuyo archivo ya no existe en disco. | Borra de Qdrant los (project, title) que ya no existen en classic/blueivory. |

Para **no reindexar desde la VM**: deja estas variables **sin definir** o en `false`. Así, tras la primera indexación completa de blueivory, los ciclos siguientes solo añaden archivos nuevos.

Persistencia: en Docker, **Qdrant** usa el volumen `qdrant_data` y el gateway usa `INDEX_USE_PERSISTENT_KEYS=true` con `gateway_data` para el SQLite de claves; al reiniciar la VM/contenedores los datos siguen y la lista de “ya indexado” se mantiene.

---

## 6.2 Cómo se controlan los cambios antes de indexar (reindexar un archivo que ya existía)

Para saber si un archivo **ya indexado** ha cambiado y debe reindexarse, el indexador **no vuelve a indexar a ciegas**: primero compara el contenido actual con lo que tenía guardado.

1. **Qué se guarda al indexar:** En cada documento de Qdrant se guarda `content_hash` = SHA-256 del contenido del archivo. Lo mismo se persiste en el SQLite de claves (project, source_path, hash) cuando `INDEX_USE_PERSISTENT_KEYS=true`.

2. **En cada ciclo (indexSharedDirs):**
   - Se cargan las claves y los **hashes** ya guardados (desde Qdrant o desde SQLite).
   - Por cada archivo en disco se calcula el hash actual (SHA-256 del contenido).
   - Si el archivo **no estaba** indexado → se indexa (archivo nuevo).
   - Si el archivo **ya estaba** indexado y `INDEX_SHARED_REINDEX_CHANGED=true`: se compara `hash actual` con `hash guardado`. Si son distintos → el archivo cambió y se **reindexa** (se borran sus puntos en Qdrant y se vuelve a indexar con el contenido nuevo).
   - Si el archivo ya estaba indexado y la variable es `false` o no está definida → no se hace nada (no se reindexa aunque el archivo haya cambiado).

3. **Para que un cambio nuevo en un archivo concreto se refleje en el índice:** hay que poner en la VM (o en `.env` del gateway):

   ```env
   INDEX_SHARED_REINDEX_CHANGED=true
   ```

   Así, en cada ciclo se comparan hashes y solo se reindexan los archivos cuyo contenido cambió; el resto no se toca.

4. **Indexar solo el diff (reindexado):** Cuando un archivo cambia y se reindexa, **no se vuelven a embeber todos los chunks**. Se hace un diff a nivel de chunk:
   - Se obtienen los puntos actuales del documento en Qdrant (con vector y contenido de cada chunk).
   - Se trocea el contenido nuevo (mismo criterio: código por límites, texto por tamaño).
   - Por cada chunk nuevo se calcula el hash del contenido. Si ese hash coincide con el de un chunk ya guardado, se **reutiliza el vector** (no se llama a la API de embeddings).
   - Solo los chunks **nuevos o modificados** se envían a la API de embeddings.
   - Luego se borran los puntos viejos del documento y se hace upsert de todos los puntos (reutilizados + nuevos). Así se ahorran llamadas a la API y coste cuando solo cambia una parte del archivo.

Resumen: el control de cambios es por **hash del contenido** (SHA-256). Sin esa variable, no se reindexa nada ya indexado; con `INDEX_SHARED_REINDEX_CHANGED=true`, solo se reindexan los archivos que realmente cambiaron, y en cada reindexado solo se embeberán los chunks del diff.

---

## 6.3 Estadísticas de archivos indexados por día

Se persisten **contadores diarios** (inbox, shared nuevos, shared reindexados, URL) en SQLite (`data/indexing_stats.db` por defecto; configurable con `INDEX_STATS_DB`).

- **Cuándo se registra:** Tras cada ciclo del supervisor (inbox y SHARED_DIRS) y cada vez que se indexa una URL con éxito (index_url, index_site).
- **Log:** Tras un ciclo con indexados, se escribe una línea estructurada `indexing_daily` con `date`, `total_today`, `inbox`, `shared_new`, `shared_reindexed`, `url`.
- **API:** `GET /stats/indexing?days=7` (por defecto 7 días, máximo 365). Respuesta: `{ byDay: [{ date, inbox, shared_new, shared_reindexed, url, total }], totalLastNDays }`. Fechas en UTC (YYYY-MM-DD).

Útil para ver cuántos archivos (p. ej. markdown generado por la IA a partir del contexto de desarrolladores) se indexan cada día.

---

## 6.4 Métricas para Grafana (InfluxDB)

Además de SQLite/API, el gateway puede enviar métricas de series de tiempo a InfluxDB para paneles en Grafana:

- **`search_requests`**: cantidad de búsquedas, latencia y resultados por búsqueda.
- **`indexing_events`**: eventos de indexación por fuente (`inbox`, `shared`, `url`).
- **`indexing_daily`**: snapshot acumulado diario (total e inbox/shared/url).

Variables:

- `INFLUXDB_URL` (ej. `http://influxdb:8086`)
- `INFLUXDB_ORG`
- `INFLUXDB_BUCKET`
- `INFLUXDB_TOKEN`

Si faltan estas variables, la exportación de métricas se desactiva sin romper indexación ni búsquedas.

---

## 7. Resumen de comprobaciones

- Rutas: classic y blueivory se resuelven bien en **local**; en **Docker** hay que montar esas carpetas.
- Extensiones: C++, C#, JS, TS, Python, etc. están cubiertas; binarios bloqueados.
- Carpetas de dependencias/build ignoradas por defecto.
- Límite 2 MB por archivo y concurrencia controlada para no disparar coste.
- Metadatos de código para C#, TS/JS y Java.
- SHARED_DIRS no borra archivos; solo INDEX_INBOX consume y borra.

Con esto el indexador está alineado con el comportamiento esperado para no perder tiempo ni dinero por indexaciones incorrectas o costes inesperados.
