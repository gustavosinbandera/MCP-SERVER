# index_site

**Tool MCP:** Indexa todo un sitio desde una URL semilla: recorre enlaces del mismo dominio (BFS) hasta indexar `max_pages` páginas.

## Cómo usarla: qué argumentos pasar

- **`url`** (obligatorio) — URL semilla (http/https). Ejemplo: `"https://wiki.ejemplo.com/"`.
- **`max_pages`** (opcional) — Máximo de páginas a indexar (default 1000, máx. 10000). Ejemplo: `500`.

**Ejemplo de invocación:**
```
url: "https://wiki.ejemplo.com/"
max_pages: 500
```

## Cuándo usarla

Para indexar documentación completa (wiki, dev center, sitio de ayuda) de un dominio.

## Parámetros

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `url` | string | Sí | URL semilla (http/https). |
| `max_pages` | number | No | Máximo de páginas a indexar (default 1000, máx. 10000). |

## Ejemplo de resultado

```
Indexadas: 250 páginas.
URLs (primeras 20): https://wiki.ejemplo.com/, https://wiki.ejemplo.com/Intro, ...
Errores (primeros 5): https://wiki.ejemplo.com/old: timeout
```

## Notas

- Solo se siguen enlaces del **mismo dominio** que la URL semilla.
- Puede tardar mucho si `max_pages` es alto; conviene usarla en momentos de bajo uso o en background.
- Requiere Qdrant y, para búsqueda semántica, OpenAI configurado.
