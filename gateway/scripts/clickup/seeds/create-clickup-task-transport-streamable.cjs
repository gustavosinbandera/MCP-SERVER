/**
 * Crea en ClickUp la tarea "Desarrollo: Módulo transport_streamable_http (solo estructura)"
 * con subtareas placeholder para ir desarrollando.
 * Requiere CLICKUP_API_TOKEN en gateway/.env
 * Uso: desde gateway/ → node scripts/clickup/seeds/create-clickup-task-transport-streamable.cjs
 */
const { loadGatewayEnv, requireDist } = require('../../_shared/script-env.cjs');
loadGatewayEnv();

const {
  getTeams,
  getSpaces,
  getFolders,
  getLists,
  createTask,
  createSubtask,
  getAuthorizedUser,
  hasClickUpToken,
} = requireDist(['clickup-client.js', 'clickup']);

async function resolveListId() {
  const listId = process.env.LIST_ID?.trim();
  if (listId) return listId;
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

async function resolveAssigneeId() {
  const id = process.env.ASSIGNEE_USER_ID?.trim();
  if (id) {
    const n = parseInt(id, 10);
    if (!Number.isNaN(n)) return n;
  }
  const user = await getAuthorizedUser();
  if (user.id != null) return user.id;
  throw new Error('No se pudo obtener user id. Define ASSIGNEE_USER_ID en .env');
}

const PARENT_NAME = 'Desarrollo: Módulo transport_streamable_http (solo estructura)';
const PARENT_DESCRIPTION = `## Objetivo
Tarea contenedora para el desarrollo del **módulo transport_streamable_http**. Solo estructura inicial; las subtareas se irán creando y detallando conforme avance el desarrollo.

## Subtareas
Se añadirán desde ClickUp o con \`createSubtask\` (herramienta MCP o scripts) según se definan.`;

const SUBTASKS = [
  '1. Especificación y diseño del módulo',
  '2. Implementación del transport streamable HTTP',
  '3. Tests',
  '4. Documentación e integración',
];

async function main() {
  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
    process.exit(1);
  }
  const listId = await resolveListId();
  const assigneeId = await resolveAssigneeId();
  console.log('Lista:', listId, '| Asignado:', assigneeId);

  console.log('Creando tarea principal:', PARENT_NAME);
  const parent = await createTask(listId, {
    name: PARENT_NAME,
    markdown_description: PARENT_DESCRIPTION,
    assignees: [assigneeId],
  });
  console.log('  URL: https://app.clickup.com/t/' + parent.id);

  for (const name of SUBTASKS) {
    console.log('Creando subtarea:', name);
    const sub = await createSubtask(listId, parent.id, {
      name,
      assignees: [assigneeId],
    });
    console.log('  https://app.clickup.com/t/' + sub.id);
  }

  console.log('\nListo. Tarea principal +', SUBTASKS.length, 'subtareas.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
