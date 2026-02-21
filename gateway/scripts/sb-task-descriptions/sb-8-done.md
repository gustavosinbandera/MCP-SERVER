## Qué se hizo
Configuración y documentación del supervisor de bugs.

## Código / archivos
- `gateway/.env.example`: comentario sobre supervisor-bugs (CLICKUP_API_TOKEN, OPENAI_API_KEY, OPENAI_CHAT_MODEL, OPENAI_CHAT_TIMEOUT_MS).
- `gateway/docs/SUPERVISOR-BUGS.md`: sección "Cómo ejecutar el supervisor" (comando `node scripts/supervisor-bugs.cjs` y `--all`) y variables de entorno necesarias.

## Cómo se usa
Definir CLICKUP_API_TOKEN y OPENAI_API_KEY en .env; opcional LIST_ID. Ejecutar desde gateway: `node scripts/supervisor-bugs.cjs`.
