/**
 * Crea dos tareas en ClickUp (Subida de archivos y Explorador de archivos),
 * las pone en "en curso", les añade la descripción en Markdown y las marca como completadas.
 *
 * Uso (desde gateway/):
 *   node scripts/create-and-complete-upload-explorer-tasks.cjs
 *   node scripts/create-and-complete-upload-explorer-tasks.cjs --list-id 901325668563
 *
 * Requiere: CLICKUP_API_TOKEN en gateway/.env
 * Opcional: LIST_ID en .env o --list-id
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const {
  getTeams,
  getSpaces,
  getFolders,
  getLists,
  getList,
  createTask,
  updateTask,
  hasClickUpToken,
} = require('../dist/clickup-client.js');

const DESCRIPTIONS_DIR = path.join(__dirname, 'task-descriptions');

const TASK_1 = {
  name: 'Subida de archivos (webapp + gateway)',
  markdownFile: path.join(DESCRIPTIONS_DIR, 'subida-archivos-webapp-gateway.md'),
};

const TASK_2 = {
  name: 'Explorador de archivos de la instancia',
  markdownFile: path.join(DESCRIPTIONS_DIR, 'explorador-archivos-instancia.md'),
};

async function resolveListId(listIdArg) {
  if (listIdArg) return listIdArg;
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

function findInProgressStatus(list) {
  const statuses = list.statuses || [];
  const lower = (s) => (s || '').toLowerCase();
  const match = statuses.find(
    (s) =>
      lower(s.status).includes('progress') ||
      lower(s.status).includes('curso') ||
      lower(s.status).includes('progreso')
  );
  if (match) return match.status;
  if (statuses.length >= 2) return statuses[1].status;
  return 'in progress';
}

function findCompleteStatus(list) {
  const statuses = list.statuses || [];
  const lower = (s) => (s || '').toLowerCase();
  const match = statuses.find(
    (s) =>
      lower(s.status).includes('complete') ||
      lower(s.status).includes('completad') ||
      lower(s.status).includes('done') ||
      lower(s.status).includes('hecho') ||
      lower(s.status).includes('finalizado')
  );
  if (match) return match.status;
  if (statuses.length > 0) return statuses[statuses.length - 1].status;
  return 'complete';
}

function readMarkdown(filePath) {
  if (!fs.existsSync(filePath)) throw new Error('Archivo no encontrado: ' + filePath);
  return fs.readFileSync(filePath, 'utf8');
}

async function main() {
  const listIdArg = process.argv.find((a, i) => process.argv[i - 1] === '--list-id')?.trim();

  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
    process.exit(1);
  }

  const listId = await resolveListId(listIdArg);
  console.log('Lista:', listId);

  const list = await getList(listId);
  const inProgressStatus = findInProgressStatus(list);
  const completeStatus = findCompleteStatus(list);
  console.log('Status "en curso":', inProgressStatus);
  console.log('Status "completado":', completeStatus);

  // 1. Crear tarea "Subida de archivos" en curso con descripción
  const md1 = readMarkdown(TASK_1.markdownFile);
  const task1 = await createTask(listId, {
    name: TASK_1.name,
    markdown_description: md1,
    status: inProgressStatus,
  });
  console.log('Tarea 1 creada (en curso):', task1.name, '→ https://app.clickup.com/t/' + task1.id);

  // 2. Crear tarea "Explorador de archivos" en curso con descripción
  const md2 = readMarkdown(TASK_2.markdownFile);
  const task2 = await createTask(listId, {
    name: TASK_2.name,
    markdown_description: md2,
    status: inProgressStatus,
  });
  console.log('Tarea 2 creada (en curso):', task2.name, '→ https://app.clickup.com/t/' + task2.id);

  // 3. Pasar ambas a completado
  await updateTask(task1.id, { status: completeStatus });
  console.log('Tarea 1 →', completeStatus);
  await updateTask(task2.id, { status: completeStatus });
  console.log('Tarea 2 →', completeStatus);

  console.log('\nListo. Ambas tareas creadas con descripción detallada y marcadas como', completeStatus);
  console.log('  -', task1.name, 'https://app.clickup.com/t/' + task1.id);
  console.log('  -', task2.name, 'https://app.clickup.com/t/' + task2.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
