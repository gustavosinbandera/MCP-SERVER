# search_github_repos

**Tool MCP:** Solo búsqueda en GitHub. Lista repositorios existentes por tema (no crea repos ni escribe scripts).

## Alias

Buscar en github, buscar repos github, listar repos github, encontrar repos, repos por tema, mejores repos tema, solo buscar repos.

## Parámetros

| Parámetro | Tipo   | Obligatorio | Descripción |
|-----------|--------|-------------|-------------|
| `topic`   | string | Sí          | Tema y filtros en lenguaje natural (ver abajo). |
| `limit`   | number | No          | Número máximo de repos (default 10, máx. 30). |
| `sort`    | string | No          | Orden: `updated`, `stars`, `forks`. Si no se pasa, se infiere del texto. |

## Filtros en el argumento `topic`

Puedes escribir en el mismo texto:

- **Temas:** esp32, c++, python, react, docker, freertos, database, api, mcp, etc. → se traducen a `topic:` y `language:`.
- **Orden inferido:** "recent", "actualidad", "último" → orden por actualización; "mejor", "top", "stars", "popular" → orden por estrellas.
- **Mínimo de estrellas:** "min-stars 500", "stars>100" → añade `stars:>N`.
- **Año / actividad:** "2024", "last year" → repos con actividad desde ese año (`pushed:>YYYY-01-01`).
- **Solo activos:** "active", "activo", "no archived" → excluye repos archivados (`archived:false`).

Ejemplos de `topic`: `esp32 c++ recent`, `react typescript stars>1000`, `mcp server 2024`, `docker python min-stars 500 active`.

## Cuándo usarla

Cuando el usuario diga **"buscar en github X"**, **"repos de esp32/mcp/etc"**, **"encontrar repos sobre..."** → usar esta tool y devolver los resultados. No crear repos ni escribir código/scripts.

## Cuándo NO usarla

No usar para crear un repositorio nuevo ni para generar o escribir scripts/código. Solo devuelve una lista de repos existentes.

## Ejemplos

- **Actualidad tech:** `topic: "MCP server", sort: "updated"` → repos más recientes sobre MCP.
- **Mejor puntuación:** `topic: "vector search", sort: "stars", limit: 15` → repos más estrellados sobre búsqueda vectorial.
- **Por defecto:** `topic: "TypeScript API"` → 10 repos ordenados por fecha de actualización.

## Rate limits

- Sin token: 10 peticiones/min (GitHub API).
- Con `GITHUB_TOKEN` en `gateway/.env`: hasta 30 peticiones/min (recomendado si usas la herramienta a menudo).

## Resultado

Para cada repo se devuelve: nombre, URL, descripción (resumida), estrellas, forks, lenguaje, topics y fecha de última actualización.
