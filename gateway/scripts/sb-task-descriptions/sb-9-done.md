## Qué se hizo
Documentación para ejecutar el supervisor de bugs de forma periódica.

## Código / archivos
- `gateway/docs/SUPERVISOR-BUGS.md`: sección "Ejecución periódica" con ejemplos de cron (Linux/mac) y Task Scheduler (Windows).

## Cómo se usa
Programar la ejecución de `node gateway/scripts/supervisor-bugs.cjs` cada X horas (ej. cada 6 h o 1 vez al día) con cron, Task Scheduler o integración en un proceso existente.
