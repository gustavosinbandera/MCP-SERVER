# Más sugerencias de indexación

Análisis de alternativas y mejoras para el indexador (semántica + metadata + rendimiento). Complementa el [CHECKLIST-semantica-openai.md](CHECKLIST-semantica-openai.md).

---

## 1. Estrategias de chunking (cómo partir el contenido)

| Estrategia | Descripción | Pros | Contras |
|------------|-------------|------|--------|
| **A. Por tamaño fijo + overlap** | Trozos de N caracteres/tokens con solapamiento (ej. 600 tokens, overlap 80). | Simple, funciona para cualquier tipo de archivo. | Puede cortar en medio de una función o párrafo. |
| **B. Por fronteras semánticas (código)** | Partir por función/clase: cada chunk = una función o una clase (o un bloque lógico). | Cada chunk tiene una unidad de significado clara; búsqueda más precisa para "donde está X". | Requiere heurísticos o parser por lenguaje (regex para `class`, `function`, `def`, etc.). |
| **C. Por fronteras semánticas (texto)** | Partir por párrafos o por cabeceras (Markdown: H1, H2). | Respeta la estructura del documento. | Menos útil para código puro. |
| **D. Híbrido** | Primero partir por función/clase (código) o por sección (docs); si una unidad supera X tokens, subdividirla por tamaño con overlap. | Equilibrio: unidades de significado + control de tamaño. | Más lógica y casos especiales. |

**Sugerencia:** Para un repo con mucho código (C++, TS, etc.), **B o D** mejoran la relevancia ("clase Invoice", "función GetChargeList"). Para docs/markdown, **C o A**. Si mezclas código y docs, **D** con reglas por tipo de archivo.

---

## 2. Qué meter en el texto que se embebe (mejor vector)

El vector lo generas a partir de un **único texto por chunk**. Puedes enriquecer ese texto para que el embedding “sepa” más contexto:

| Enfoque | Ejemplo de texto a embeber | Efecto |
|---------|----------------------------|--------|
| **Solo contenido del chunk** | El fragmento tal cual. | Vector refleja solo ese trozo. |
| **Prefijo de contexto** | `File: DBAccess.cpp | Classes: CAccountItemEx, CDBObject |\n\n` + contenido del chunk. | La similitud incluye archivo y clases; "clase Invoice" acerca más chunks de archivos que declaran esa clase. |
| **Cabecera de función/clase** | Para código: primera línea de la función/clase + cuerpo (ej. `void GetChargeList();\n...código...`). | Búsquedas tipo "GetChargeList" o "donde se obtiene la lista de cargos" matchean mejor. |

**Sugerencia:** Usar **prefijo de contexto** (nombre de archivo + nombres de clase, si los extraes) en el texto que se envía a `embed()`. Así el vector “lleva” esa información y la búsqueda semántica la aprovecha sin depender solo de filtros.

---

## 3. Metadata en el payload (filtros y presentación)

Además de `source_path`, `project`, `chunk_index`, `total_chunks`:

| Campo | Uso | Cómo obtenerlo |
|-------|-----|-----------------|
| **`classes`** | Lista de nombres de clase en el archivo (o en el chunk). Filtro: "solo chunks de archivos con clase Invoice". | Regex en el contenido: `class\s+(\w+)`, `interface\s+(\w+)`, etc. |
| **`file_type`** o **`language`** | Filtro por tipo: solo .cpp, solo .md. | Por extensión o por detector de lenguaje. |
| **`module`** o **`folder`** | Ej. `Common`, `gateway/src`. Filtro por área del proyecto. | Partes de `source_path` (primeros segmentos). |
| **`description`** | Resumen legible del ítem: "DBAccess.cpp — CAccountItemEx, ObjInvoice". | Concatenar archivo + clases; si hay varias clases, listarlas aquí (como pediste). |
| **`last_modified`** (opcional) | Ordenar o filtrar por antigüedad. | `fs.statSync` al indexar (o git log si se integra después). |

**Sugerencia:** Implementar al menos **`classes`** y **`description`** (archivo + clases). Añadir **`file_type`** y **`module`** si quieres filtros por tipo de archivo o por carpeta en la búsqueda.

---

## 4. Deduplicación y actualizaciones (evitar duplicados y ahorrar API)

| Enfoque | Descripción | Ventaja |
|---------|-------------|--------|
| **Hash del contenido** | Antes de embeber, calcular hash (ej. SHA-256) del texto del chunk. Si ya existe un punto con ese hash (o `source_path` + hash), no volver a llamar a la API ni re-upsert. | Ahorra coste de embedding cuando el archivo no cambió. |
| **ID estable por chunk** | ID = hash de `(source_path, chunk_index)` o de `(source_path, content_hash)`. Upsert con ese ID: si el contenido cambia, el mismo ID se actualiza. | Evita duplicados al reindexar; Qdrant actualiza en lugar de acumular. |
| **Borrar por documento al reindexar** | Al reindexar un archivo: borrar todos los puntos con ese `source_path` (filter en Qdrant), luego insertar los chunks nuevos. | Estado consistente por archivo; no necesitas hash. |

**Sugerencia:** Combinar **ID estable** (path + chunk_index o path + content_hash) con **borrar por `source_path`** cuando se reindexa un archivo concreto, para que no queden chunks viejos. Opcional: **hash de contenido** para saltar embedding si el chunk no cambió (requiere guardar hash en payload o en otro store).

---

## 5. Búsqueda híbrida (vector + keyword)

| Enfoque | Descripción | Cuándo ayuda |
|---------|-------------|--------------|
| **Solo vector** | Query → embed → Qdrant search por similitud. | Bueno para lenguaje natural ("cómo se crea la factura"). |
| **Vector + filtro keyword en payload** | Mismo flujo, pero post-filtrar (o pre-filtrar) por `title`/`content`/`classes` que contengan la query. | Cuando el usuario escribe el nombre exacto ("CAccountItemEx", "DBAccess.cpp"). |
| **Dos búsquedas combinadas** | 1) Vector search (top-K). 2) Keyword search (scroll + filter). Unir resultados y desduplicar por ID; opcionalmente reordenar por score combinado. | Mejor de ambos mundos: "clase Invoice" encuentra por keyword y por significado. |

**Sugerencia:** Empezar con **vector + filtro opcional por keyword** en el payload (ej. si la query es corta y alfanumérica, aplicar también filtro por `classes` o `title`). Si hace falta más precisión en nombres exactos, valorar **híbrido** (vector + keyword y merge de resultados).

---

## 6. Preprocesado antes de embeber (solo para código)

| Acción | Descripción | Efecto |
|--------|-------------|--------|
| **No tocar** | Embeber el código tal cual. | Nombres de clase/función y comentarios influyen en el vector. |
| **Normalizar espacios** | Colapsar múltiples espacios/saltos de línea. | Menos ruido; mismo significado, menos tokens. |
| **Incluir solo firmas + comentarios** (opción agresiva) | Para “buscar qué hace este archivo”: embeber solo cabeceras de funciones y comentarios, no el cuerpo. | Chunks muy pequeños; buena para “resumen”, mala para “implementación de X”. |
| **Prefijo estructurado** | Añadir solo al inicio: `File: X | Classes: A, B |\n` + código. | Ya cubierto en sección 2. |

**Sugerencia:** Mantener el código en el chunk; añadir **prefijo** (archivo + clases) y, si quieres, **normalizar espacios** para ahorrar tokens sin perder significado.

---

## 7. Rendimiento de indexación (batch y paralelismo)

| Mejora | Descripción |
|--------|-------------|
| **Batch de embeddings** | OpenAI permite enviar varios textos en una sola llamada (ej. hasta 2048 textos por request en algunos endpoints). Reducir round-trips. |
| **Batch de upsert en Qdrant** | Acumular 50–100 puntos y hacer un solo `upsert`. Ya en el checklist. |
| **Paralelismo controlado** | Indexar varios archivos en paralelo (ej. 5–10 a la vez) con `p-limit` o similar. Cuidar rate limits de la API. |
| **Cola en segundo plano** | Para inbox/supervisor: no bloquear la respuesta; encolar indexación y procesar en background. |

**Sugerencia:** Implementar **batch de embeddings** (si el cliente OpenAI lo soporta para tu modelo) y **batch de upsert**; añadir **paralelismo** con límite para no saturar la API.

---

## 8. Resumen: qué priorizar

1. **Chunking:** Híbrido por función/clase cuando sea código; por tamaño con overlap cuando la unidad sea muy grande (o para docs).
2. **Texto a embeber:** Prefijo con nombre de archivo + nombres de clase (y opcionalmente módulo).
3. **Payload:** `classes`, `description` (archivo + clases), `file_type`, `module`; ID estable (path + chunk_index o content hash).
4. **Reindexación:** Borrar por `source_path` antes de insertar nuevos chunks; opcional skip por content hash.
5. **Búsqueda:** Vector como principal; filtro por keyword en payload (o híbrido) para nombres exactos.
6. **Rendimiento:** Batch de embeddings + batch de upsert + paralelismo controlado.

Si quieres, estos puntos se pueden bajar al checklist como ítems concretos (por ejemplo: “Añadir prefijo File + Classes al texto embebido”, “Campo `classes` y `description` en payload”, “Chunking por función/clase para .cpp/.ts”). 
