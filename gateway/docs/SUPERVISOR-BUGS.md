# Supervisor de bugs (ClickUp)

El agente supervisor de bugs lee una lista de ClickUp, detecta tareas de tipo bug, revisa el código y escribe en la tarea una solución sugerida (sin modificar código).

## Lista ClickUp

- Se usa la **misma lista** que el resto del proyecto (variable `LIST_ID` en `.env` o auto-descubrimiento: workspace MCP-SERVER → primer space → primer folder → primera lista).
- Opcional: crear una lista dedicada "Bugs" o "Supervisor bugs" y fijar su ID en `LIST_ID` para que el supervisor solo lea esa lista.

## Convención: bugs como tareas

Como ClickUp no tiene un tipo "Bug" obligatorio:

- **Cualquier tarea** cuyo **título empiece por `BUG-`** se considera un bug reportado.
- Ejemplos: `BUG-Error al exportar PDF`, `BUG-Login falla en Safari`, `BUG-MCP timeout`.
- El supervisor filtra con `task.name.startsWith('BUG-')` y solo procesa esas tareas.

## Dónde se escribe la solución

- En la **descripción** de la tarea (`markdown_description`).
- Se añade una sección **`## Solución sugerida`** con: causa probable, solución propuesta y pasos para arreglar (archivo, función, cambio sugerido). El agente no modifica código del repo.

## Cómo ejecutar el supervisor

Desde el directorio `gateway/`:

```bash
node scripts/supervisor/supervisor-bugs.cjs
```

Solo se procesan tareas BUG-* que **aún no tienen** la sección "Solución sugerida". Para re-procesar todas (reemplazar la sección):

```bash
node scripts/supervisor/supervisor-bugs.cjs --all
```

**Variables de entorno necesarias:**

- `CLICKUP_API_TOKEN`: token personal de ClickUp (pk_...).
- `OPENAI_API_KEY`: clave de OpenAI para generar la solución (chat).
- `LIST_ID` (opcional): ID de la lista donde están las tareas; si no se define, se descubre la primera lista del workspace.
- Opcionales: `OPENAI_CHAT_MODEL` (por defecto `gpt-4o-mini`), `OPENAI_BASE_URL`, `OPENAI_CHAT_TIMEOUT_MS`.

## Ejecución periódica

Para mantener las soluciones al día, ejecuta el supervisor de forma periódica:

- **Linux/mac (cron):** `0 */6 * * * cd /ruta/MCP-SERVER/gateway && node scripts/supervisor/supervisor-bugs.cjs` (cada 6 h).
- **Windows (Task Scheduler):** Crear tarea que ejecute `node scripts/supervisor/supervisor-bugs.cjs` en la carpeta gateway, con la frecuencia deseada.
- **Integrado:** Llamar al script desde un proceso existente (ej. timer en el supervisor de indexación) o desde CI.
