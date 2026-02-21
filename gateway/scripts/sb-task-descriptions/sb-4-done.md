## Qué se hizo
Módulo que, dado el título y la descripción del bug, busca en el repo archivos de código relevantes.

## Código / archivos
- `gateway/src/bug-search-code.ts`: `findRelevantCode(bugTitle, bugDescription, options)` — extrae palabras clave, recorre `gateway/src` (.ts), puntúa por coincidencias en path y contenido, devuelve hasta N archivos con contenido truncado para el LLM.

## Cómo se usa
Importar `findRelevantCode` desde `supervisor-bugs`; pasar título y descripción del bug para obtener `CodeSnippet[]`.
