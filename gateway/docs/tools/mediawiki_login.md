# mediawiki_login

**Tool MCP:** Inicia sesión en un sitio **MediaWiki** (obtiene el token de login vía API y guarda la sesión en cookies). Usa las credenciales de `gateway/.env` (`INDEX_URL_USER`, `INDEX_URL_PASSWORD`). Después de un login correcto, las herramientas **view_url**, **index_url** y **list_url_links** podrán acceder a páginas protegidas de ese sitio.

## Cómo usarla: qué argumentos pasar

- **`url`** (obligatorio) — URL de cualquier página del sitio MediaWiki, o el origen del sitio. Debe empezar por `http://` o `https://`. Ejemplos: `https://dev.magaya.com/index.php/API`, `https://dev.magaya.com`.

**Ejemplo de invocación:**
```
url: "https://dev.magaya.com/index.php/API"
```

## Cuándo usarla

- Cuando una URL devuelve "Login required" y quieres que las siguientes peticiones (view_url, index_url, list_url_links) vayan autenticadas.
- Para establecer la sesión antes de indexar o ver páginas de un wiki corporativo (p. ej. Hyperion/MediaWiki).

## Parámetros (resumen)

| Parámetro | Tipo   | Obligatorio | Descripción |
|-----------|--------|-------------|-------------|
| `url`     | string | Sí          | URL u origen del sitio MediaWiki (http/https). |

## Resultado que obtienes

- **Éxito:** mensaje indicando que la sesión se ha iniciado en el host; las siguientes llamadas a view_url/index_url/list_url_links para ese sitio usarán la sesión.
- **Error:** mensaje indicando qué falló (credenciales faltantes, URL inválida, login rechazado por el servidor).

## Notas

- Las credenciales se leen de **gateway/.env**: `INDEX_URL_USER` e `INDEX_URL_PASSWORD`.
- El flujo interno: pide el token de login a la API de MediaWiki (`api.php?action=query&meta=tokens&type=login`), luego hace POST de login con usuario, contraseña y token; las cookies se guardan y se reutilizan en las peticiones posteriores al mismo host.
- No devuelve el token al cliente por seguridad; solo confirma éxito o error.
