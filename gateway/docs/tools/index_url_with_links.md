# index_url_with_links

**Tool MCP:** Indexa una URL y hasta `max_links` páginas enlazadas del mismo dominio (documentación, FAQ, etc.).

## Cómo usarla: qué argumentos pasar

- **`url`** (obligatorio) — URL semilla (http/https). Ejemplo: `"https://docs.ejemplo.com/"`.
- **`max_links`** (opcional) — Máximo de páginas enlazadas a indexar (default 20, máx. 50). Ejemplo: `30`.

**Ejemplo de invocación:**
```
url: "https://docs.ejemplo.com/install"
max_links: 25
```

## Cuándo usarla

Para indexar un sitio y sus subpáginas relacionadas sin recorrer todo el dominio (control explícito del número de enlaces).

## Parámetros

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `url` | string | Sí | URL semilla (http/https). |
| `max_links` | number | No | Máximo de páginas enlazadas a indexar (default 20, máx. 50). |

## Ejemplo de resultado

```
Indexadas: 15/21 páginas.
URLs: https://docs.ejemplo.com/, https://docs.ejemplo.com/install, ...
Errores: https://docs.ejemplo.com/roto: 404
```

## Diferencia con index_site

- **index_url_with_links**: límite bajo (hasta 50), ideal para un conjunto acotado de enlaces desde una página.
- **index_site**: recorre el sitio en BFS hasta un número mayor de páginas (hasta 10000), para documentación completa.
