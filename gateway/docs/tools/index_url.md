# index_url

**Tool MCP:** Indexa el contenido de una URL en Qdrant (Knowledge Hub). Obtiene la página, convierte HTML a texto y guarda los chunks en `mcp_docs`. Si la URL ya existía, se actualiza (se borran los puntos anteriores de esa URL y se insertan los nuevos).

## Cómo usarla: qué argumentos pasar

- **`url`** (obligatorio) — URL completa de la página. Debe empezar por `http://` o `https://`.

**Ejemplo de invocación:**
```
url: "https://wiki.ejemplo.com/Guía-de-uso"
```

## Cuándo usarla

Para añadir documentación o páginas importantes desde internet (wikis, docs, artículos) al Knowledge Hub.

## Parámetros (resumen)

| Parámetro | Tipo   | Obligatorio | Descripción |
|-----------|--------|-------------|-------------|
| `url`     | string | Sí          | URL completa (http:// o https://). |

## Ejemplos

- `index_url` con `url: "https://wiki.ejemplo.com/Guía-de-uso"`.
- Desde el editor: "Indexa la URL https://docs.miempresa.com/api."

## Resultados

- **Éxito:** `URL indexada: [título de la página]\nhttps://...`
- **Error:** `Error al indexar https://...: [mensaje]` (p. ej. timeout, 404, sin contenido).

## Notas

- Se usa `html-to-text` para convertir HTML a texto plano.
- Tamaño máximo de contenido tratado: 2 MB.
- Si hay `OPENAI_API_KEY`, se generan embeddings; si no, se guarda con vector dummy (solo búsqueda por palabras después).
