## Qué se hizo
Resolución de lista ClickUp y filtro de tareas cuyo título empiece por `BUG-`.

## Código / archivos
- `gateway/src/supervisor-bugs.ts`: `resolveBugListId()` (LIST_ID o auto-descubrimiento), `getBugTasks(listId)` (getTasks + filtro `name.startsWith('BUG-')`).

## Cómo se usa
Importar `resolveBugListId` y `getBugTasks`; obtener listId y luego la lista de tareas bug para procesar.
