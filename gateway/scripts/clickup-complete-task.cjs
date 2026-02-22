/**
 * Marca una tarea ClickUp como completada (estado "complete" / "done" / "completado" según la lista).
 * Uso: desde gateway/ → node scripts/clickup-complete-task.cjs --task-id 86afmer8g
 * Opcional: --list-id 901325668563 (si no, usa LIST_ID de .env o obtiene de la tarea).
 * Requiere CLICKUP_API_TOKEN en .env
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const taskId = process.argv.find((a, i) => process.argv[i - 1] === '--task-id');
const listIdArg = process.argv.find((a, i) => process.argv[i - 1] === '--list-id');

if (!taskId) {
  console.error('Uso: node scripts/clickup-complete-task.cjs --task-id <task_id> [--list-id <list_id>]');
  process.exit(1);
}

const {
  getTask,
  getList,
  updateTask,
  hasClickUpToken,
} = require('../dist/clickup-client.js');

function findCompleteStatus(list) {
  const statuses = list.statuses || [];
  const lower = (s) => (s || '').toLowerCase();
  const match = statuses.find(
    (s) =>
      lower(s.status).includes('complete') ||
      lower(s.status).includes('completad') ||
      lower(s.status).includes('done') ||
      lower(s.status).includes('hecho') ||
      lower(s.status).includes('finalizado') ||
      lower(s.status).includes('terminad')
  );
  if (match) return match.status;
  if (statuses.length > 0) return statuses[statuses.length - 1].status;
  return 'complete';
}

async function main() {
  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
    process.exit(1);
  }
  let listId = listIdArg || process.env.LIST_ID?.trim();
  if (!listId) {
    const task = await getTask(taskId);
    listId = task.list?.id;
    if (!listId) {
      console.error('No se pudo obtener list_id de la tarea. Usa --list-id o LIST_ID en .env');
      process.exit(1);
    }
  }
  const list = await getList(listId);
  const completeStatus = findCompleteStatus(list);
  console.log('Estado a aplicar:', completeStatus);
  await updateTask(taskId, { status: completeStatus });
  console.log('Tarea', taskId, 'marcada como', completeStatus);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
