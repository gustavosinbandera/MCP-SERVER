# Flujo n8n: Bugs por rango de fechas + descripción + 3 tools (sin hardcodear)

Objetivo: listar work items por **argumentos** (fecha inicio, opcional fecha fin; si no hay fecha fin se usa el día actual), leer la descripción de cada uno y buscar información en el repositorio con **tres tools**: `search_docs`, `analize_code` y una de las dos de análisis de código añadidas (`tree_sitter_parse`, `semgrep_scan`). Todo por argumentos de las tools, sin hardcodear.

---

## 1. Listar bugs por rango de fechas (argumentos)

La tool **azure_list_work_items** acepta:

- **from_date** (opcional): fecha inicio `YYYY-MM-DD` (inclusive). Si se envía, se filtra por rango.
- **to_date** (opcional): fecha fin `YYYY-MM-DD` (inclusive). **Si no se envía y hay from_date, se usa el día actual.**
- **date_field** (opcional): `"created"` o `"changed"` (por defecto `"changed"`).
- **type**, **assigned_to**, **top**: opcionales. Si no envías **states**, se devuelven ítems en cualquier estado.

**Nodo HTTP Request:** `tools/call` → `azure_list_work_items`

- **URL:** la que uses (local: `http://host.docker.internal:3001/mcp`).
- **Headers:** `Content-Type`, `Authorization`, `mcp-session-id` (desde Store session).
- **Body (ejemplo: último mes hasta hoy, bugs asignados a Gustavo, cualquier estado):**

Las fechas deben venir de variables/expresiones en n8n (por ejemplo calculadas en un nodo previo), no hardcodeadas en el JSON si quieres “desde hace un mes” dinámico. Ejemplo con placeholders (omitir **states** para incluir cualquier estado):

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "azure_list_work_items",
    "arguments": {
      "type": "Bug",
      "assigned_to": "Gustavo Grisales",
      "from_date": "{{ $json.from_date }}",
      "top": 50
    }
  }
}
```

- `from_date`: obligatorio si quieres filtro por fecha (ej. hace un mes). En un nodo Code previo puedes calcular `from_date` (y opcionalmente `to_date`); si no envías `to_date`, la tool usa el día actual.
- No hace falta nodo Code para filtrar por “último mes”: la tool respeta **from_date** y, si no hay **to_date**, usa la fecha de hoy.

Ejemplo de argumentos para “desde hace un mes hasta hoy” (las fechas las puede generar un Code o un nodo anterior):

- `from_date`: `"2026-02-07"` (o expresión n8n que calcule “hoy - 1 mes”).
- `to_date`: no enviar (la tool usa hoy) o enviar explícitamente `"2026-03-07"`.

---

## 2. Convertir lista a un item por work item (para el loop)

La respuesta de **azure_list_work_items** es texto con líneas `#id [Type] (State) title  YYYY-MM-DD`. Para iterar por cada bug necesitas un **Code** que parsee y devuelva **un item por work item** (sin filtrar por fecha; el filtro ya lo hizo la tool).

**Código para el nodo Code (parsear lista → 1 item por work item):**

```javascript
const item = $input.first();
const json = item.json;
let text = '';
try {
  const content = json.result?.content;
  if (Array.isArray(content) && content[0]?.text) text = content[0].text;
} catch (e) {
  return [{ json: { error: String(e.message) } }];
}
const lineRe = /^#(\d+)\s+\[(\w+)\]\s+\(([^)]+)\)\s+(.+?)\s+(\d{4}-\d{2}-\d{2})\s*$/;
const lines = text.split('\n').filter((l) => l.trim().startsWith('#'));
const rows = [];
for (const line of lines) {
  const m = line.match(lineRe);
  if (m) rows.push({ id: m[1], type: m[2], state: m[3], title: m[4].trim(), date: m[5] });
}
return rows.map((r) => ({
  json: {
    workItemId: parseInt(r.id, 10),
    workItemIdStr: r.id,
    title: r.title,
    state: r.state,
    date: r.date,
    type: r.type,
  },
}));
```

---

## 3. Por cada bug: leer descripción (azure_get_work_item)

**Nodo HTTP Request** (dentro del loop):

- **tools/call** → `azure_get_work_item`
- **arguments:** `{ "work_item_id": {{ $json.workItemId }} }`

La descripción y el título se obtienen de la respuesta; un **Code** posterior puede extraer un único texto “descripción” para pasarlo a las tres tools por argumentos.

---

## 4. Tres tools para buscar en el repositorio (por argumentos)

Todas las tools se invocan con **argumentos** (nada hardcodeado): query/description/path desde el item actual (título, descripción del bug, o paths derivados).

### Tool 1: `search_docs`

- **name:** `search_docs`
- **arguments:** `{ "query": "{{ $json.bugTitle }} {{ $json.bugDescriptionSummary }}" }`  
  (o el campo que tengas con título/resumen del bug).

### Tool 2: `analize_code`

- **name:** `analize_code`
- **arguments:** `{ "description": "{{ $json.bugDescription }}" }`  
  Opcional: `project`, `branch`, `limit` si los usas.

### Tool 3: una de las dos herramientas de análisis de código

Las dos tools añadidas al MCP para análisis de código son:

- **`tree_sitter_parse`** – AST de un archivo (estructura, nodos).  
  - **arguments:** `{ "file_path": "{{ $json.file_path }}" }`  
  - `file_path`: ruta relativa al proyecto o absoluta (puede venir de `search_docs`/`analize_code` o de un Code que extraiga el path más relevante del bug).

- **`semgrep_scan`** – Análisis estático (seguridad/calidad) en un directorio.  
  - **arguments:** `{ "path": "{{ $json.scan_path }}", "config": "auto", "format": "text" }`  
  - `path`: directorio a escanear (relativo o absoluto); opcional: `config`, `format`.

Para “tres tools” puedes usar, por ejemplo:

1. **search_docs** (query = título/descripción del bug).
2. **analize_code** (description = descripción del bug).
3. **tree_sitter_parse** (file_path de un archivo relevante) **o** **semgrep_scan** (path de una carpeta relevante).

Los valores (`file_path`, `scan_path`, `bugTitle`, `bugDescription`) deben venir de los nodos anteriores (p. ej. Code que parsee la respuesta de `azure_get_work_item` y opcionalmente de `search_docs`/`analize_code`).

---

## 5. Orden sugerido del flujo

1. Trigger → **MCP initialize local** → **Store session local**.
2. (Opcional) **Code:** calcular `from_date` (y si quieres `to_date`) y sacar un item con esos campos para el siguiente nodo.
3. **List bugs** (azure_list_work_items con **from_date** y sin **to_date** para “hasta hoy”, o con **to_date**; type, assigned_to, top por argumento; omitir states para cualquier estado).
4. **Code:** parsear texto de la lista → 1 item por work item.
5. **Loop / Split Out** sobre esos items.
6. Por cada item:
   - **Get work item** (azure_get_work_item con `work_item_id` del item).
   - **Code:** extraer título, descripción y (opcional) path o carpeta para tree_sitter/semgrep.
   - **HTTP Request** → `search_docs` (query por argumento).
   - **HTTP Request** → `analize_code` (description por argumento).
   - **HTTP Request** → `tree_sitter_parse` (file_path) **o** `semgrep_scan` (path).
7. Opcional: **Code** que junte resultados de las 3 tools en un reporte.

---

## 6. Resumen: filtro por fechas y tres tools

- **Fechas:** La tool **azure_list_work_items** respeta **from_date** y **to_date** por argumento. Si no se envía **to_date**, se usa el día actual. Nada hardcodeado.
- **Tres tools de “repositorio”:**
  - **search_docs** – búsqueda en el Knowledge Hub (argumento `query`).
  - **analize_code** – análisis con contexto del Hub (argumento `description`).
  - **tree_sitter_parse** (AST de un archivo) **o** **semgrep_scan** (análisis estático en un path) – argumentos `file_path` / `path` (y opcionales según la tool).

Integración de las dos herramientas de análisis de código: **tree_sitter_parse** y **semgrep_scan**; se elige una de las dos como tercera tool según si quieres analizar un archivo concreto (AST) o un directorio (semgrep).
