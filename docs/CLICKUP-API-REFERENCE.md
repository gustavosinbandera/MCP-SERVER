# ClickUp API – Referencia para el agente MCP

Referencia mínima para integrar ClickUp con las herramientas MCP (listar workspaces/listas/tareas, crear y actualizar tareas). Uso en local e instancia con `CLICKUP_API_TOKEN`.

## Enlaces oficiales

- [ClickUp API](https://developer.clickup.com/)
- [Getting Started](https://developer.clickup.com/docs/Getting%20Started)
- [API Reference](https://developer.clickup.com/reference)
- [OpenAPI spec](https://developer.clickup.com/docs/open-api-spec)
- [API v2 / v3 terminology](https://developer.clickup.com/docs/general-v2-v3-api)

## Autenticación

- **Personal API Token (recomendado para este agente):** Se genera en ClickUp: **Settings → Apps → API Token**. El token suele comenzar por `pk_`. No expira.
- **Cómo obtener el token:** En ClickUp, clic en tu avatar o en **Settings** → **Apps** (o **My Apps**) → **API Token** → **Generate** / **Generar**. Copia el token y guárdalo; solo se muestra una vez.
- **Header:** En cada petición: `Authorization: <token>` (el valor literal del token, sin prefijo "Bearer" en la API v2 de ClickUp).
- **Variable de entorno:** `CLICKUP_API_TOKEN` en `.env` o `gateway/.env` (local) y en el `.env` del proyecto en la instancia (o variables del contenedor). Ver `gateway/.env.example`.

## Base URL

```
https://api.clickup.com/api/v2
```

## Terminología API v2

| Término API v2 | Significado |
|----------------|-------------|
| Team           | Workspace (organización) |
| Space          | Espacio dentro de un workspace |
| Folder         | Carpeta dentro de un space (puede contener listas) |
| List           | Lista de tareas (donde se crean las tareas) |
| Task           | Tarea / ticket |

## Endpoints usados por el agente

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/user` | Usuario autorizado (token actual). Devuelve `id`, `username`, etc. Útil para `assignees`. |
| GET    | `/team` | Listar workspaces (teams). Devuelve array con `id`, `name`, etc. |
| GET    | `/team/{team_id}/space` | Listar spaces de un workspace. Parámetro: `team_id`. |
| GET    | `/space/{space_id}/folder` | Listar folders de un space. Parámetro: `space_id`. Incluye listas sin folder. |
| GET    | `/folder/{folder_id}/list` | Listar listas de un folder. Parámetro: `folder_id`. |
| GET    | `/list/{list_id}/task` | Listar tareas de una lista. Parámetros query opcionales: `archived`, `statuses`, etc. |
| POST   | `/list/{list_id}/task` | Crear tarea. Body: `name` (requerido), `description`, **`markdown_description`** (recomendado para MD), `status`, `assignees`, etc. |
| GET    | `/task/{task_id}` | Obtener una tarea por ID. Query opcional: `include_markdown_description=true` para devolver la descripción en Markdown. |
| PUT    | `/task/{task_id}` | Actualizar tarea. Body: `name`, `markdown_description`, `status`, `priority` (1–4), `time_estimate` (ms), etc. |
| POST   | `/task/{task_id}/tag/{tag_name}` | Añadir tag a la tarea. Body: `{ "workspace_id": "..." }`. El tag debe existir en el workspace. |
| POST   | `/team/{team_id}/time_entries` | Crear time entry. Body: `task_id`, `duration` (ms), `start` (Unix ms), `description`, `billable`. |
| POST   | `/task/{task_id}/link` | Enlazar tarea a otra. Body: `{ "links_to": "otro_task_id" }`. |

## Descripciones en Markdown

Si envías la descripción en el campo `description` con sintaxis Markdown (`, ##, ```), ClickUp puede mostrarla como texto plano. Para que se renderice correctamente (títulos, bloques de código, listas):

- **Crear tarea:** usa `markdown_description` en el body del POST.
- **Actualizar tarea:** usa `markdown_description` en el body del PUT.

El cliente en `gateway/src/clickup-client.ts` y el script `gateway/scripts/update-clickup-tasks-in-progress.cjs` ya usan `markdown_description`.

## Respuestas y errores

- **200:** OK; cuerpo JSON con los datos.
- **401:** Token inválido o faltante. Comprobar `CLICKUP_API_TOKEN`.
- **404:** Recurso no encontrado (team_id, list_id, task_id incorrectos).
- **429:** Rate limit. Reintentar tras el tiempo indicado en la respuesta.

## Configuración en la instancia

Para usar las herramientas ClickUp desde el MCP en la instancia EC2:

1. Conectarte por SSH a la instancia.
2. Editar el `.env` del proyecto (por ejemplo `~/MCP-SERVER/.env` o `~/MCP-SERVER/gateway/.env` según cómo se arranque el gateway).
3. Añadir: `CLICKUP_API_TOKEN=pk_...` (tu Personal API Token).
4. Reiniciar el servicio del gateway/MCP si está corriendo (por ejemplo `docker compose restart gateway` o el proceso que sirva el MCP).

Ver también [COMANDOS-INSTANCIA-EC2.md](COMANDOS-INSTANCIA-EC2.md) para conexión SSH y gestión de servicios.
