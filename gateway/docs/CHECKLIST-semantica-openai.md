# Checklist: Búsqueda semántica con OpenAI + mejora del indexador

**Objetivo:** Usar la API de OpenAI para embeddings, búsqueda semántica en Qdrant, y mejorar el indexador (incl. archivos largos).

**Estado:** Implementación inicial hecha. Si ya tenías datos en `mcp_docs` con vector size 1, borra la colección en Qdrant y reindexa (inbox + SHARED_DIRS + URLs que uses).

---

## ¿Quién indexa?

**Sí hay que indexar de nuestro lado.** OpenAI no indexa por ti: solo convierte texto → vector. Nosotros seguimos siendo responsables de:

1. Leer archivos / URLs / inbox
2. Partir (chunking) los archivos largos
3. Llamar a OpenAI para obtener el vector de cada chunk (o de cada doc corto)
4. Guardar en Qdrant: vector + payload

Para archivos **demasiado largos** hay que hacer algo: OpenAI tiene límite por request (ej. 8191 tokens por llamada en `text-embedding-3-small`), y un solo vector para un archivo enorme da mala precisión. Por tanto: **sí, hay que chunkear** los archivos largos antes de embeber e indexar.

---

## 1. Configuración y entorno

- [ ] Añadir variable `OPENAI_API_KEY` (o leerla de `.env`).
- [ ] Definir variable opcional `OPENAI_EMBEDDING_MODEL` (ej. `text-embedding-3-small`; por defecto ese).
- [ ] Documentar en `.env.example` las nuevas variables.
- [ ] Decidir: si no hay `OPENAI_API_KEY`, ¿fallback a búsqueda por keyword (actual) o error claro?

---

## 2. Módulo de embeddings (OpenAI)

- [ ] Añadir dependencia: cliente OpenAI (ej. `openai` en npm).
- [ ] Crear módulo (ej. `embedding.ts` o `openai-embed.ts`) que:
  - [ ] Exporte una función `embed(text: string): Promise<number[]>`.
  - [ ] Use el modelo elegido (ej. `text-embedding-3-small`, 1536 dimensiones).
  - [ ] Respete límite de tokens por request (truncar o chunkear el texto si supera el máximo del modelo).
- [ ] Definir constante o config con la **dimensión del vector** (1536 para `text-embedding-3-small`) para usarla al crear la colección en Qdrant.

---

## 3. Colección Qdrant (tamaño de vector)

- [ ] La colección actual usa `vectors: { size: 1 }`. Para embeddings reales hace falta el tamaño del modelo (ej. 1536).
- [ ] Decidir: **recrear `mcp_docs`** (borrar + crear con `size: 1536`) o **nueva colección** (ej. `mcp_docs_v2`) y migrar código a ella.
- [ ] Actualizar todos los sitios que crean la colección para usar el nuevo `size`:
  - [ ] `inbox-indexer.ts` (`ensureCollection`)
  - [ ] `url-indexer.ts` (`ensureCollection`)
- [ ] Documentar que tras el cambio hay que **reindexar todo** (flushear y volver a indexar).

---

## 4. Chunking (archivos largos)

- [ ] Definir parámetros de chunking: tamaño máximo por chunk (ej. 500–800 tokens o ~2000–3200 caracteres) y overlap (ej. 80–100 tokens).
- [ ] Implementar función de chunking (ej. por caracteres con overlap, o por líneas/párrafos si se prefiere):
  - Entrada: texto completo, `source_path`, `project`, etc.
  - Salida: lista de `{ text, chunk_index, total_chunks }` (y metadatos para el payload).
- [ ] Decidir umbral: documentos menores a X caracteres (o tokens) → 1 solo chunk; mayores → aplicar chunking.
- [ ] Incluir en cada payload de chunk: `title`, `content` (solo ese chunk), `source_path`, `project`, `chunk_index`, `total_chunks` (y `url` para URLs si aplica).

---

## 5. Indexador (inbox + shared dirs)

- [ ] Por cada archivo: leer contenido (mantener `MAX_FILE_SIZE_BYTES` o ajustar si hace falta).
- [ ] Aplicar chunking si el contenido supera el umbral; si no, un solo “chunk” con todo el texto.
- [ ] Por cada chunk: llamar a `embed(chunkText)` → obtener vector.
- [ ] Construir puntos para Qdrant: `{ id, vector, payload }` con `source_path`, `project`, `chunk_index`, `total_chunks`, etc.
- [ ] Opcional pero recomendado: **batch upsert** (ej. 50–100 puntos por llamada) en lugar de un `upsert` por chunk.
- [ ] Mantener lógica de “ya indexado” (ej. `existsDocByProjectAndPath` o equivalente por doc; si se usa chunking, definir si la clave es por documento o por chunk).
- [ ] Actualizar `indexDocument` (o reemplazarlo) para que use embeddings + chunking y, si aplica, batch.

---

## 6. Indexador de URLs

- [ ] Tras obtener `title` y `content` de la URL (y recorte a 2 MB si aplica), aplicar el **mismo chunking** que para archivos.
- [ ] Por cada chunk: `embed(chunkText)` y upsert con payload que incluya `url`, `chunk_index`, `total_chunks`.
- [ ] Reutilizar la misma dimensión de vector y, si existe, la lógica de batch upsert.

---

## 7. Búsqueda (search)

- [ ] En `searchDocs`: si hay `OPENAI_API_KEY` (y opcionalmente `EMBEDDING_PROVIDER=openai`):
  - [ ] Llamar a `embed(query)` para obtener el vector de la query.
  - [ ] Usar `client.search(COLLECTION, { vector: queryVector, limit, with_payload: true, filter por project si aplica })`.
  - [ ] Devolver resultados con score (y payload con `content`, `source_path`, `chunk_index`, etc.).
- [ ] Si no hay API key (o fallback activado): mantener comportamiento actual (scroll + filtro por keyword).
- [ ] Ajustar tipo de retorno si se añade `score` a los resultados.

---

## 8. Existencia y deduplicación

- [ ] Con chunking, un “documento” son varios puntos. Decidir:
  - Cómo se considera “ya indexado” un archivo (ej. por `project` + `source_path`; si existe al menos un punto con ese par, no reindexar).
- [ ] Actualizar `existsDocByProjectAndPath` (o la función que se use) para que siga siendo válida con el nuevo esquema (ej. buscar por payload `project` + `source_path` o `title`).

---

## 9. Pruebas y validación

- [ ] Probar embedding de un texto corto y comprobar que el vector tiene la dimensión esperada (1536).
- [ ] Probar indexación de un archivo corto (1 punto) y uno largo (varios chunks).
- [ ] Probar búsqueda semántica: query en lenguaje natural y comprobar que los resultados tienen sentido (y scores).
- [ ] Probar filtro por `project` si se usa.
- [ ] Probar fallback a keyword cuando no hay API key (si se implementa).

---

## 10. Documentación y despliegue

- [ ] Actualizar README o docs con: variables de entorno, que la colección debe recrearse/reindexarse, y coste aproximado de indexar (ej. ~1 USD por 100 MB).
- [ ] Dejar anotado en el checklist que, tras desplegar, hay que **reindexar** (vaciar colección o recrearla y volver a ejecutar indexación de inbox, shared dirs y URLs que se usen).

---

## Resumen de archivos a tocar (cuando se implemente)

| Área | Archivos |
|------|----------|
| Config / env | `.env.example`, posiblemente `gateway/.env.example` |
| Embeddings | Nuevo: `gateway/src/embedding.ts` (o similar) |
| Colección | `inbox-indexer.ts`, `url-indexer.ts` (ensureCollection + tamaño de vector) |
| Chunking | Nuevo: `gateway/src/chunking.ts` (o dentro del indexador) |
| Indexación | `inbox-indexer.ts` (indexDocument, processInboxItem, indexSharedDirs), `url-indexer.ts` (indexUrl) |
| Búsqueda | `search.ts` (searchDocs) |
| Dependencias | `gateway/package.json` (openai) |

---

*Checklist listo para revisar y, cuando decidas, implementar sin tocar código hasta entonces.*
