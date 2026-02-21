## Qué se hizo
Módulo de generación de solución con LLM (OpenAI Chat).

## Código / archivos
- `gateway/src/bug-solution-llm.ts`: system prompt (experto MCP, protocolos, DevOps, JavaScript/Node), `generateSolutionMarkdown(bugTitle, bugDescription, codeSnippets)` — llama a OpenAI chat y devuelve Markdown estructurado (resumen, causa, solución, pasos). `hasOpenAIForBugs()` para comprobar OPENAI_API_KEY.

## Cómo se usa
Requiere `OPENAI_API_KEY` en .env. Opcional: `OPENAI_CHAT_MODEL`, `OPENAI_BASE_URL`, `OPENAI_CHAT_TIMEOUT_MS`.
