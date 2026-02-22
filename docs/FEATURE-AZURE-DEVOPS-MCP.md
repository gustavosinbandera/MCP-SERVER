# Feature: Conexión Azure DevOps en MCP

## Resumen

Integración de Azure DevOps (Server) con el MCP Knowledge Hub: herramientas para listar work items, ver cambios (changesets) TFVC y diffs de archivos, desde Cursor o cualquier cliente MCP.

---

## Lo implementado

### Cliente (`gateway/src/azure-devops-client.ts`)

- **Autenticación:** PAT (Personal Access Token) en Basic auth. Variables de entorno: `AZURE_DEVOPS_BASE_URL`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT`.
- **Work Items:** WIQL para listar ítems con filtros: tipo (Bug/Task), estados, año, top, asignado a @Me o a un usuario concreto.
- **TFVC:** Obtención de changesets, archivos modificados por changeset, contenido de archivo en un changeset, búsqueda del changeset anterior por ruta para diff.
- **Diff:** Diff legible (LCS) entre dos versiones de un archivo en cambiosets consecutivos para la misma ruta.

### Herramientas MCP

| Tool | Descripción |
|------|-------------|
| **azure** | Alias: `accion` "listar tareas", opcional `usuario` (ej. "gustavo grisales"). Sin usuario = asignados a ti. |
| **azure_list_work_items** | Lista work items. Opcionales: `assigned_to`, `type`, `states`, `year`, `top`. |
| **azure_get_work_item** | Detalle de un work item por ID. |
| **azure_get_bug_changesets** | Changesets TFVC vinculados a un bug (relaciones ArtifactLink): autor, fecha, comentario, archivos. |
| **azure_get_changeset** | Un changeset: autor, fecha, comentario, lista de archivos. |
| **azure_get_changeset_diff** | Diff de un archivo en un changeset (opcional `file_index`). |

### Script CLI

- **gateway/scripts/azure-list-user-tasks.cjs:** Lista work items por usuario o @Me, con año opcional. Uso: `node scripts/azure-list-user-tasks.cjs "gustavo grisales" 2026`.

### Configuración

- `.env`: `AZURE_DEVOPS_BASE_URL`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT`. Opcional: `AZURE_DEVOPS_API_VERSION` (por defecto 7.0).
- Documentación en `gateway/.env.example`.

---

## Enlaces a commits

- **Implementación Azure (tipos TS, script, alias):** [ea15eb7](https://github.com/gustavosinbandera/MCP-SERVER/commit/ea15eb7) — *Azure: tipos TS en tools, script azure-list-user-tasks (usuario/año/@Me), alias azure listar tareas*
- **Documentación de la feature:** [2f18c5f](https://github.com/gustavosinbandera/MCP-SERVER/commit/2f18c5f) — *docs: FEATURE-AZURE-DEVOPS-MCP (conexión Azure DevOps en MCP)*

---

## Futuro: supervisión autónoma de tickets

- **Supervisar tickets de manera autónoma:** Agente o job que periódicamente consulte Azure DevOps (work items asignados a un usuario o equipo), detecte estados (ej. bloqueados, sin actividad X días), priorice y notifique o cree tareas derivadas en ClickUp/otro sistema.
- **Reglas configurables:** Umbrales de días sin cambio, estados “en riesgo”, asignación por área/proyecto.
- **Integración con el Hub:** Usar el MCP como interfaz para que la IA sugiera acciones sobre tickets (ej. “estos 3 bugs llevan 7 días en Code Review”) o genere resúmenes semanales por usuario.

---

*Documento generado como parte del cierre del ticket ClickUp de la feature Azure DevOps MCP.*
