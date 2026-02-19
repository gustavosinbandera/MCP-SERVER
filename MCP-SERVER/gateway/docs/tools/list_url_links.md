# list_url_links

**Tool MCP:** Lista cuántos subenlaces y archivos contiene una URL. Obtiene la página, extrae todos los `href` y devuelve conteos y listas en **Markdown** (tabla + listas), listo para mostrar en consola o en un cliente que renderice Markdown.

## Cómo usarla: qué argumentos pasar

- **`url`** (obligatorio) — URL de la página a analizar. Debe empezar por `http://` o `https://`.

**Ejemplo de invocación:**
```
url: "https://ejemplo.com/docs"
```

## Cuándo usarla

- Para inspeccionar enlaces remotos.
- Para listar todas las URLs (sublinks) dentro de una página.
- Para listar archivos referenciados (PDF, ZIP, imágenes, etc.) en esa URL.

## Parámetros (resumen)

| Parámetro | Tipo   | Obligatorio | Descripción |
|-----------|--------|-------------|-------------|
| `url`     | string | Sí          | URL de la página (http/https). |

## Resultado que obtienes (Markdown)

La salida es **Markdown** para que se vea bien en consola o en el chat:

- **Encabezado** con la URL analizada.
- **Tabla** con cantidad de sublinks (páginas) y de archivos.
- **Listas** con hasta 200 sublinks y hasta 100 archivos (el resto se resume).

Ejemplo:

```markdown
## Enlaces en la URL

**URL:** https://ejemplo.com

| Tipo | Cantidad |
|------|----------|
| Sublinks / páginas | 15 |
| Archivos | 3 |

**Total:** 18 elementos

### Sublinks (páginas)
- https://ejemplo.com/about
- https://ejemplo.com/docs
...

### Archivos
- https://ejemplo.com/file.pdf
...
```

## Notas

- Se consideran "archivos" las URLs con extensiones como `.pdf`, `.zip`, `.doc`, `.png`, etc.
- El resto de enlaces se cuentan como sublinks/páginas.
- Se respetan sesión y autenticación (INDEX_URL_USER / INDEX_URL_PASSWORD) si están configurados.
