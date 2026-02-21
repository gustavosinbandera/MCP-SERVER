/**
 * Script de consola: crea una tarea de ejemplo en ClickUp (workspace MCP-SERVER).
 * Requiere CLICKUP_API_TOKEN en gateway/.env
 * Uso: desde gateway/ → node scripts/create-clickup-example-task.cjs
 */
const path = require('path');
// Cargar gateway/.env y sobrescribir cualquier variable previa (p. ej. de .env en raíz)
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const {
  getTeams,
  getSpaces,
  getFolders,
  getLists,
  createTask,
  hasClickUpToken,
} = require('../dist/clickup-client.js');

async function main() {
  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
    process.exit(1);
  }
  console.log('Listando workspaces...');
  const teams = await getTeams();
  if (!teams.length) {
    console.error('No hay workspaces. Crea uno en ClickUp (ej. MCP-SERVER).');
    process.exit(1);
  }
  const team = teams.find((t) => t.name && t.name.includes('MCP-SERVER')) || teams[0];
  const teamId = String(team.id);
  console.log('Workspace:', team.name || teamId, '(id:', teamId, ')');

  console.log('Listando spaces...');
  const spaces = await getSpaces(teamId);
  if (!spaces.length) {
    console.error('No hay spaces en este workspace. Crea un Space en ClickUp.');
    process.exit(1);
  }
  const space = spaces[0];
  const spaceId = space.id;
  console.log('Space:', space.name || spaceId, '(id:', spaceId, ')');

  console.log('Listando folders...');
  const folders = await getFolders(spaceId);
  if (!folders.length) {
    console.error('No hay folders en este space. Crea una List o Folder en ClickUp.');
    process.exit(1);
  }
  const folder = folders[0];
  const folderId = folder.id;
  console.log('Folder:', folder.name || folderId, '(id:', folderId, ')');

  console.log('Listando listas...');
  const lists = await getLists(folderId);
  if (!lists.length) {
    console.error('No hay listas en este folder. Crea una List en ClickUp.');
    process.exit(1);
  }
  const list = lists[0];
  const listId = list.id;
  console.log('Lista:', list.name || listId, '(id:', listId, ')');

  const taskName = 'Tarea de ejemplo desde consola';
  const taskDescription = 'Creada por script create-clickup-example-task.cjs para probar la integración MCP-SERVER con ClickUp.';
  console.log('Creando tarea:', taskName);
  const task = await createTask(listId, {
    name: taskName,
    description: taskDescription,
  });
  console.log('Tarea creada: id =', task.id, ', nombre =', task.name);
  console.log('URL:', 'https://app.clickup.com/t/' + task.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
