## Qué se hizo
Actualización de la tarea en ClickUp con la sección "Solución sugerida" en la descripción.

## Código / archivos
- `gateway/src/supervisor-bugs.ts`: `buildDescriptionWithSolution(currentDescription, solutionMarkdown)` — construye la descripción final (descripción existente + sección "Solución sugerida" + texto generado; si ya existía la sección, la reemplaza). Se usa `updateTask(taskId, { markdown_description })` del cliente ClickUp.

## Cómo se usa
Tras generar el Markdown de la solución, llamar a `buildDescriptionWithSolution` con la descripción actual de la tarea y el texto generado; luego `updateTask` con el resultado.
