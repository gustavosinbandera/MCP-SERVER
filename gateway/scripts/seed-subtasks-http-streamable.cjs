/**
 * Crea la tarea "Módulo HTTP SSE" y sus 24 subtareas en ClickUp (o añade las subtareas a una tarea existente).
 * Requiere CLICKUP_API_TOKEN en gateway/.env (mismo patrón que create-clickup-task.cjs).
 *
 * Uso (desde gateway/):
 *   node scripts/seed-subtasks-http-streamable.cjs
 *     → Crea la tarea padre "Módulo HTTP SSE" y las 24 subtareas en la lista por defecto.
 *   node scripts/seed-subtasks-http-streamable.cjs --parent-id <task_id>
 *     → Añade las 24 subtareas a la tarea existente.
 *   node scripts/seed-subtasks-http-streamable.cjs --list-id <list_id>
 *     → Crea la tarea padre y subtareas en esa lista.
 */
const path = require('path');
// Mismo patrón que create-clickup-task.cjs y create-clickup-subtask.cjs (no tocar)
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const {
  getTeams,
  getSpaces,
  getFolders,
  getLists,
  getList,
  createTask,
  createSubtask,
  updateTask,
  getAuthorizedUser,
  hasClickUpToken,
} = require('../dist/clickup-client.js');

const PARENT_TASK_NAME = 'Desarrollo: Módulo HTTP SSE';
const PARENT_TASK_DESCRIPTION = `## Objetivo
Tarea contenedora para el desarrollo del **módulo HTTP SSE** (Server-Sent Events / transport streamable HTTP).

## Subtareas
Las 24 subtareas se crean con el script \`seed-subtasks-http-streamable.cjs\`.`;

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { parentId: null, listId: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--parent-id' && args[i + 1]) {
      out.parentId = args[i + 1].trim();
      i++;
    } else if (args[i] === '--list-id' && args[i + 1]) {
      out.listId = args[i + 1].trim();
      i++;
    }
  }
  return out;
}

// Misma lógica que create-clickup-subtask.cjs: --list-id o LIST_ID o primera lista del workspace
async function resolveListId(opts) {
  if (opts.listId) return opts.listId;
  const listIdEnv = process.env.LIST_ID?.trim();
  if (listIdEnv) return listIdEnv;
  const teams = await getTeams();
  if (!teams.length) throw new Error('No hay workspaces.');
  const team = teams.find((t) => t.name && t.name.includes('MCP-SERVER')) || teams[0];
  const spaces = await getSpaces(String(team.id));
  if (!spaces.length) throw new Error('No hay spaces.');
  const folders = await getFolders(spaces[0].id);
  if (!folders.length) throw new Error('No hay folders.');
  const lists = await getLists(folders[0].id);
  if (!lists.length) throw new Error('No hay listas.');
  return lists[0].id;
}

function findCompleteStatus(list) {
  const statuses = list.statuses || [];
  const lower = (s) => (s || '').toLowerCase();
  const match = statuses.find(
    (s) =>
      lower(s.status).includes('complete') ||
      lower(s.status).includes('completad') ||
      lower(s.status).includes('done') ||
      lower(s.status).includes('hecho')
  );
  if (match) return match.status;
  if (statuses.length > 0) return statuses[statuses.length - 1].status;
  return 'complete';
}

const SUBTASKS = [
  {
    title: '1. Auditar SDK MCP: soporte Streamable HTTP',
    description: `Verificar si \`@modelcontextprotocol/sdk\` trae transport Streamable HTTP server.

**Para qué:** Decidir si usamos transport oficial o custom.

**Listo:** Nota en docs/issue con conclusión + clase/exports a usar.

**Fecha de finalización:** 2026-02-23`,
  },
  {
    title: '2. Crear branch y checklist de no-regresiones',
    description: `Crear branch de trabajo y checklist: stdio debe seguir funcionando, supervisor 2 pasos intacto, tests pasan.

**Listo:** Checklist en gateway/docs/ o PR template.

**Fecha de finalización:** 2026-02-23`,
  },
  {
    title: '3. Extraer factory buildMcpServer(ctx) (solo estructura)',
    description: `Extraer creación del McpServer a función exportada sin cambiar tools.

**Para qué:** Soportar instancias por usuario en HTTP.

**Listo:** Compila y tests pasan.

**Fecha de finalización:** 2026-02-24`,
  },
  {
    title: '4. Migrar modo stdio a usar buildMcpServer({userId:\'local\'})',
    description: `Actualizar entrypoint stdio para usar la factory, sin cambiar comportamiento.

**Listo:** Cursor stdio sigue listando tools.

**Fecha de finalización:** 2026-02-24`,
  },
  {
    title: '5. Agregar dependencia y módulo verificación JWT (Cognito)',
    description: `Integrar verificación JWT (JWKS cache).

**Para qué:** Identificar userId=sub en HTTP.

**Listo:** Módulo auth/jwt.ts o similar + variables env documentadas.

**Fecha de finalización:** 2026-02-25`,
  },
  {
    title: '6. Middleware Express requireJwt (401 si falta/inválido)',
    description: `Middleware que adjunta req.auth={userId}.

**Listo:** Test unitario: sin token → 401, token inválido → 401, válido → next().

**Fecha de finalización:** 2026-02-25`,
  },
  {
    title: '7. Definir ADMIN_SUBS (allowlist simple)',
    description: `Helper isAdmin(userId) basado en env ADMIN_SUBS.

**Para qué:** Proteger tools de ingesta global sin roles/grupos.

**Listo:** Tests de parsing env + casos.

**Fecha de finalización:** 2026-02-26`,
  },
  {
    title: '8. Crear SessionManager: estructuras + límites + TTL',
    description: `Implementar Map<userId, Map<sessionId, runtime>>, MAX_SESSIONS_PER_USER, SESSION_TTL_MS.

**Listo:** Tests: límite por usuario y cleanup TTL.

**Fecha de finalización:** 2026-02-26`,
  },
  {
    title: '9. Endpoint /mcp "stub" protegido por JWT',
    description: `Crear ruta /mcp en gateway HTTP (sin lógica MCP aún) que exige JWT.

**Listo:** 401 sin token; 200/501 con token (placeholder).

**Fecha de finalización:** 2026-02-27`,
  },
  {
    title: '10. Implementar /mcp Streamable HTTP usando SDK (o wrapper)',
    description: `Implementar POST/GET según Streamable HTTP para MCP.

**Para qué:** Cursor pueda apuntar a URL remota.

**Listo:** initialize + tools/list funciona con curl/cliente.

**Fecha de finalización:** 2026-03-02`,
  },
  {
    title: '11. Crear runtime por sesión: buildMcpServer({userId}) + connect(transport)',
    description: `Al crear sesión (JWT→userId), crear McpServer por sesión y conectarlo al transport HTTP.

**Listo:** Sesiones aisladas por userId.

**Fecha de finalización:** 2026-03-03`,
  },
  {
    title: '12. Cierre de sesión: DELETE /mcp o cleanup onclose',
    description: `Implementar cierre explícito y/o cleanup al desconectar.

**Para qué:** Evitar leaks.

**Listo:** Borrar runtime del map y liberar recursos.

**Fecha de finalización:** 2026-03-03`,
  },
  {
    title: '13. Documento de configuración Cursor (mcp.json + Bearer)',
    description: `Crear doc HTTP-MCP-CURSOR.md con ejemplo type: streamable-http + header Authorization.

**Listo:** Doc listo y revisado.

**Fecha de finalización:** 2026-03-04`,
  },
  {
    title: '14. Añadir config User KB: USER_KB_ROOT_DIR + helpers',
    description: `Agregar getUserKbRootDir() y getUserKbUserDir(userId).

**Para qué:** Persistir markdown por usuario.

**Listo:** Unit test de paths.

**Fecha de finalización:** 2026-03-04`,
  },
  {
    title: '15. Docker: montar volumen ./USER_KB:/app/USER_KB',
    description: `Actualizar docker-compose.yml con volumen + env USER_KB_ROOT_DIR.

**Listo:** docker compose up sin errores.

**Fecha de finalización:** 2026-03-05`,
  },
  {
    title: '16. Tool nueva documentar_sesion (guardar md en User KB)',
    description: `Tool que escribe MD en USER_KB_ROOT_DIR/<userId>/<yyyy>/<mm>/....

**Para qué:** Experiencia del usuario persistente.

**Listo:** Test crea archivo y retorna ruta.

**Fecha de finalización:** 2026-03-05`,
  },
  {
    title: '17. Proteger tools admin-only (index_url, index_site, feed global)',
    description: `En buildMcpServer, envolver tools admin-only con isAdmin(ctx.userId).

**Listo:** Usuario normal recibe error; admin funciona.

**Fecha de finalización:** 2026-03-06`,
  },
  {
    title: '18. Supervisor: añadir paso indexUserKbRoots() (NO borrar)',
    description: `Tercer paso del supervisor: recorrer USER_KB_ROOT_DIR/*/**/*.md e indexar incremental.

**Para qué:** Serializar a Qdrant pero mantener archivos.

**Listo:** Indexa y NO elimina.

**Fecha de finalización:** 2026-03-09`,
  },
  {
    title: '19. Payload Qdrant para user docs: owner_user_id, doc_kind=experience',
    description: `Ajustar indexación para incluir metadatos.

**Para qué:** Filtrar búsqueda global + personal.

**Listo:** Chunks guardan payload correcto.

**Fecha de finalización:** 2026-03-09`,
  },
  {
    title: '20. Búsqueda personalizada: incluir KB global + KB del usuario',
    description: `En tool de búsqueda, filtrar por owner_user_id in (global, userId) sin romper búsquedas existentes.

**Listo:** Test: user ve sus docs y global.

**Fecha de finalización:** 2026-03-10`,
  },
  {
    title: '21. Logs estructurados mínimos (userId/sessionId/tool/latency)',
    description: `Añadir logging uniforme en rutas /mcp y tool calls.

**Para qué:** Debug multiusuario.

**Listo:** Logs incluyen campos base.

**Fecha de finalización:** 2026-03-10`,
  },
  {
    title: '22. Infra: endurecer CloudFormation (SSH CIDR) + doc operación',
    description: `Cambiar default AllowedSSHCIDR recomendado y documentar despliegue seguro.

**Listo:** PR/commit con YAML + nota en README.

**Fecha de finalización:** 2026-03-11`,
  },
  {
    title: '23. Configuración Cursor con MCP remoto (mcp.json + streamable-http)',
    description: `Configurar .cursor/mcp.json para servidor remoto: url, transport streamable-http, header Authorization Bearer (MCP_API_KEY).

**Problemas típicos:** Servidor "no existe" para el agente si no está en la lista de disponibles; 504 al cortar nginx.

**Listo:** Doc HTTP-MCP-CURSOR.md y ejemplo mcp.json; timeouts nginx 3600s para /api/.

**Fecha de finalización:** 2026-02-21`,
  },
  {
    title: '24. Problemas resueltos: timeout 504 en index_site y servidor MCP no visible',
    description: `**Problema 1:** index_site con max_pages 1000+ superaba proxy_read_timeout 300s → 504 → Cursor daba por caído el MCP.

**Solución:** Aumentar en nginx.conf proxy_send_timeout y proxy_read_timeout a 3600s para location /api/.

**Problema 2:** Tras un 504, el agente dejaba de "ver" el servidor (solo cursor-ide-browser disponible).

**Solución:** Evitar 504 con timeouts mayores; reconectar MCP o abrir nuevo chat.

**Listo:** nginx.conf actualizado y desplegado en instancia.

**Fecha de finalización:** 2026-02-21`,
  },
];

async function main() {
  const opts = parseArgs();
  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
    process.exit(1);
  }
  const listId = await resolveListId(opts);
  const list = await getList(listId);
  const completeStatus = findCompleteStatus(list);
  console.log('Lista:', listId, '| Status completado:', completeStatus);

  let assigneeId = null;
  const assigneeEnv = process.env.ASSIGNEE_USER_ID?.trim();
  if (assigneeEnv) {
    const n = parseInt(assigneeEnv, 10);
    if (!Number.isNaN(n)) assigneeId = n;
  }
  if (assigneeId == null) {
    try {
      const user = await getAuthorizedUser();
      if (user.id != null) assigneeId = user.id;
    } catch (e) {
      console.warn('No se pudo obtener assignee:', e.message);
    }
  }

  let parentId = opts.parentId;
  if (!parentId) {
    console.log('Creando tarea padre:', PARENT_TASK_NAME);
    const parent = await createTask(listId, {
      name: PARENT_TASK_NAME,
      markdown_description: PARENT_TASK_DESCRIPTION,
      ...(assigneeId != null ? { assignees: [assigneeId] } : {}),
    });
    parentId = parent.id;
    console.log('  URL: https://app.clickup.com/t/' + parentId);
  }

  const created = [];
  for (const item of SUBTASKS) {
    console.log('Creando:', item.title);
    const body = { name: item.title, ...(assigneeId != null ? { assignees: [assigneeId] } : {}) };
    try {
      const sub = await createSubtask(listId, parentId, body);
      created.push({ id: sub.id, title: item.title, description: item.description });
      console.log('  →', sub.id);
    } catch (e) {
      if (e.message && e.message.includes('400') && (e.message.includes('Parent not child of list') || e.message.includes('ITEM_137'))) {
        console.error('La tarea padre no está en la lista usada (', listId, ').');
        console.error('Pasa --list-id <id_lista> con la lista donde está la tarea padre (puedes ver el id en la URL de la lista en ClickUp).');
        process.exit(1);
      }
      throw e;
    }
  }

  console.log('\nActualizando descripción y marcando completadas...');
  for (const item of created) {
    await updateTask(item.id, {
      markdown_description: item.description,
      status: completeStatus,
    });
    console.log('  OK:', item.title);
  }

  console.log('\nListo. 24 subtareas creadas, con descripción y estado "' + completeStatus + '".');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
module.exports = { SUBTASKS };
