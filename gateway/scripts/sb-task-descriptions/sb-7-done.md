## Qué se hizo
Script orquestador que ejecuta el flujo completo del supervisor de bugs.

## Código / archivos
- `gateway/scripts/supervisor-bugs.cjs`: carga .env, obtiene listId, lista tareas BUG-*, para cada una (no procesada o con --all): getTask, findRelevantCode, generateSolutionMarkdown, buildDescriptionWithSolution, updateTask.

## Cómo se usa
Desde gateway: `node scripts/supervisor-bugs.cjs` (solo bugs sin "Solución sugerida") o `node scripts/supervisor-bugs.cjs --all` (re-procesar todas).
