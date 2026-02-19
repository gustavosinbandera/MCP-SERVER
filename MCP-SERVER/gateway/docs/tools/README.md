# Herramientas MCP del Knowledge Hub

Este directorio documenta cada **tool** expuesta por el servidor MCP y los **scripts de consola** del gateway.

## Cómo ver la ayuda desde consola

Desde la raíz del **gateway**:

```bash
node scripts/mcp-tools-menu.cjs
```

Se abre un menú numerado (1-9 = herramientas, 0 = índice, S = salir). Para ver la ayuda de una herramienta escribe su **número** o **número --help**, por ejemplo:
- `1` o `1 --help` → ayuda de **search_docs**
- `2 --help` → ayuda de **count_docs**
- `0` → documentación general (índice)
- `S` → salir

También puedes pedir ayuda directa por nombre:

```bash
node scripts/mcp-tools-menu.cjs search_docs --help
node scripts/mcp-tools-menu.cjs index_url --help
```

(Se muestra el contenido del documento correspondiente.)

---

## Herramientas MCP (usadas desde el editor / cliente MCP)

| Tool | Descripción breve |
|------|-------------------|
| [search_docs](search_docs.md) | Búsqueda en la documentación indexada (Qdrant). |
| [count_docs](count_docs.md) | Cuenta documentos en la colección. |
| [analize_code](analize_code.md) | Análisis de código con contexto desde la BD. |
| [index_url](index_url.md) | Indexa el contenido de una URL. |
| [index_url_with_links](index_url_with_links.md) | Indexa una URL y hasta N enlaces del mismo dominio. |
| [index_site](index_site.md) | Indexa un sitio completo (BFS desde una URL). |
| [write_flow_doc](write_flow_doc.md) | Crea un documento de flujo en el inbox para indexar. |
| [list_shared_dir](list_shared_dir.md) | Lista archivos en un directorio compartido. |
| [read_shared_file](read_shared_file.md) | Lee un archivo del directorio compartido. |
| [list_url_links](list_url_links.md) | Lista subenlaces y archivos de una URL (salida en Markdown). |
| [view_url](view_url.md) | Muestra el contenido de una URL en Markdown (ver/inspeccionar sin indexar). |
| [mediawiki_login](mediawiki_login.md) | Inicia sesión en un sitio MediaWiki (token + cookies) para acceder a páginas protegidas con view_url/index_url. |

Cada documento incluye una sección **"Cómo usarla: qué argumentos pasar"** con los parámetros que debes enviar al invocar la tool (obligatorios y opcionales) y un ejemplo concreto de invocación.

### Alias y sugerencias

En el menú (`npm run tools`) puedes referirte a una herramienta de forma amigable:

- **Por número:** `1`, `2`, … `9`, o `1 --help`.
- **Por alias:** cada tool tiene alias (ej. `buscar`, `search` para search_docs; `flow doc`, `flujo` para write_flow_doc). Escribe el alias en lugar del nombre técnico.
- **Por frase:** si escribes algo como "buscar en la documentación" o "indexar una url", el menú sugiere la tool que mejor coincide y muestra su ayuda.

La configuración de alias y palabras clave para sugerencias está en **`gateway/scripts/tools-config.cjs`**.

Las herramientas **list_url_links** y **view_url** (y otras que devuelvan texto largo) presentan la salida en **Markdown** (tablas, listas, títulos) para que se vea bien en la consola o en clientes que rendericen Markdown (p. ej. Cursor). Al agregar una nueva tool al MCP, añade allí una entrada con `name`, `aliases` y `keywords` para que el menú y la IA puedan referirse a ella de forma amigable.

---

## Scripts de consola (gateway)

| Script | Uso |
|--------|-----|
| `node scripts/index-example-doc.cjs` | Indexa `docs_repo/docs/ejemplo.txt` en Qdrant. |
| `node scripts/migrate-collection-size.cjs` | Borra la colección `mcp_docs` para recrearla con el tamaño de vector correcto (p. ej. 1536). |

Documentación general del gateway: [../README.md](../) (si existe) o [MIGRACION-COLECCION.md](../MIGRACION-COLECCION.md), [TESTING.md](../TESTING.md).
