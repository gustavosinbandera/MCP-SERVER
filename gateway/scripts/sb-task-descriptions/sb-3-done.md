## Qué se hizo
Detección de tareas ya procesadas para no sobrescribir la sección "Solución sugerida".

## Código / archivos
- `gateway/src/supervisor-bugs.ts`: `isAlreadyProcessed(task)` — devuelve true si la descripción de la tarea contiene `## Solución sugerida`.

## Cómo se usa
Antes de procesar una tarea BUG, comprobar `isAlreadyProcessed(task)`; si es true, omitir o re-procesar según criterio.
