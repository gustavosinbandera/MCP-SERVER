# Herramientas MCP del Knowledge Hub

Este directorio documenta cada **tool** expuesta por el servidor MCP y los **scripts de consola** del gateway.

## Cómo ver la ayuda desde consola

Desde la raíz del **gateway**:

```bash
node scripts/mcp/mcp-tools-menu.cjs
```

Se abre un menú numerado (1-9 = herramientas, 0 = índice, S = salir). Para ver la ayuda de una herramienta escribe su **número** o **número --help**, por ejemplo:
- `1` o `1 --help` → ayuda de **search_docs**
- `2 --help` → ayuda de **count_docs**
- `0` → documentación general (índice)
- `S` → salir

También puedes pedir ayuda directa por nombre:

```bash
node scripts/mcp/mcp-tools-menu.cjs search_docs --help
node scripts/mcp/mcp-tools-menu.cjs index_url --help
```

(Se muestra el contenido del documento correspondiente.)

---

## Herramientas MCP (usadas desde el editor / cliente MCP)

Listado alineado con `gateway/src/mcp-server.ts`. Las que tienen enlace tienen documento propio en este directorio.

### Knowledge Hub / búsqueda

| Tool | Descripción breve |
|------|-------------------|
| [search_docs](search_docs.md) | Búsqueda en la documentación indexada (Qdrant). Filtros: project, branch, source_type, domain, class_name, referenced_type, file_name. |
| [count_docs](count_docs.md) | Devuelve cuántos documentos hay indexados en la colección mcp_docs (Qdrant). |
| [analize_code](analize_code.md) | Análisis de código con contexto de la BD: descripción → búsqueda en Qdrant y fragmentos para que la IA analice con contexto. |

### Indexación (URLs y sitios)

| Tool | Descripción breve |
|------|-------------------|
| [index_url](index_url.md) | Indexa el contenido de una URL en Qdrant. Opcional: project, render_js (SPA). |
| [index_url_with_links](index_url_with_links.md) | Indexa una URL y hasta max_links páginas enlazadas del mismo dominio. |
| [index_site](index_site.md) | Indexa un sitio desde una URL semilla (BFS). max_pages, render_js, skip_already_indexed. |

### Documentación y flujos

| Tool | Descripción breve |
|------|-------------------|
| [write_flow_doc](write_flow_doc.md) | Crea un documento markdown (nodo del mapa de flujos) en INDEX_INBOX_DIR. Parámetros: title, description; opcionales: files, functions, flow_summary, bug_id, project. |
| documentar_sesion | Guarda un documento Markdown de experiencia/sesión en la KB personal del usuario (persistente). Parámetros: title, content; opcionales: bugOrFeatureId, tags. |

### Directorio compartido y URLs

| Tool | Descripción breve |
|------|-------------------|
| [list_shared_dir](list_shared_dir.md) | Lista directorios y archivos en el directorio compartido (SHARED_DIRS). relative_path opcional. |
| [read_shared_file](read_shared_file.md) | Lee el contenido de un archivo en el directorio compartido. relative_path requerido. |
| [list_url_links](list_url_links.md) | Lista subenlaces y archivos de una URL (conteos y listas en Markdown). |
| [view_url](view_url.md) | Muestra el contenido de una URL en Markdown. Opcional: render_js (SPA). |
| [mediawiki_login](mediawiki_login.md) | Inicia sesión en un sitio MediaWiki (INDEX_URL_USER/PASSWORD). Para acceder a páginas protegidas con view_url, index_url, list_url_links. |

### GitHub y Git

| Tool | Descripción breve |
|------|-------------------|
| [search_github_repos](search_github_repos.md) | Búsqueda en GitHub por tema. Parámetros: topic; opcionales: limit, sort (updated, stars, forks). |
| [repo_git](repo_git.md) | Manipula el repo Git del workspace: status, add, commit (message), push, pull. Opcional: directory, paths. |

### ClickUp

| Tool | Descripción breve |
|------|-------------------|
| clickup_list_workspaces | Lista workspaces (teams) de ClickUp. Requiere CLICKUP_API_TOKEN. |
| clickup_list_spaces | Lista spaces de un workspace. team_id. |
| clickup_list_folders | Lista folders de un space. space_id. |
| clickup_list_lists | Lista listas de un folder. folder_id. |
| clickup_list_tasks | Lista tareas de una lista. list_id; opcionales: status, archived. |
| clickup_create_task | Crea una tarea en una lista. list_id, name; opcionales: description, status, priority. |
| clickup_create_subtask | Crea una subtarea bajo una tarea. list_id, parent_task_id, name; opcionales: description, status, priority. |
| clickup_get_task | Obtiene el detalle de una tarea. task_id. |
| clickup_update_task | Actualiza una tarea (estado, título, descripción, prioridad). task_id; opcionales: name, description, status, priority. |

### Utilidad

| Tool | Descripción breve |
|------|-------------------|
| list_tools | Lista todas las herramientas MCP disponibles con su nombre y descripción. Sin parámetros. |

Cada documento enlazado incluye (cuando aplica) una sección **"Cómo usarla: qué argumentos pasar"** con los parámetros obligatorios y opcionales y un ejemplo de invocación.

### Alias y sugerencias

En el menú (`npm run tools`) puedes referirte a una herramienta de forma amigable:

- **Por número:** `1`, `2`, … `9`, o `1 --help`.
- **Por alias:** cada tool tiene alias (ej. `buscar`, `search` para search_docs; `flow doc`, `flujo` para write_flow_doc). Escribe el alias en lugar del nombre técnico.
- **Por frase:** si escribes algo como "buscar en la documentación" o "indexar una url", el menú sugiere la tool que mejor coincide y muestra su ayuda.

La configuración de alias y palabras clave para sugerencias está en **`gateway/scripts/internal/tools-config.cjs`**.

Las herramientas **list_url_links** y **view_url** (y otras que devuelvan texto largo) presentan la salida en **Markdown** (tablas, listas, títulos) para que se vea bien en la consola o en clientes que rendericen Markdown (p. ej. Cursor). Al agregar una nueva tool al MCP, añade allí una entrada con `name`, `aliases` y `keywords` para que el menú y la IA puedan referirse a ella de forma amigable.

---

## Scripts de consola (gateway)

| Script | Uso |
|--------|-----|
| `node scripts/dev/index-example-doc.cjs` | Indexa `docs_repo/docs/ejemplo.txt` en Qdrant. |
| `node scripts/internal/migrate-collection-size.cjs` | Borra la colección `mcp_docs` para recrearla con el tamaño de vector correcto (p. ej. 1536). |

Documentación general del gateway: [../README.md](../) (si existe) o [MIGRACION-COLECCION.md](../MIGRACION-COLECCION.md), [TESTING.md](../TESTING.md).
