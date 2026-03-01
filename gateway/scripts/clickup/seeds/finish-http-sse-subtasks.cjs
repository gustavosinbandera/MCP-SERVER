/**
 * Finaliza las subtareas existentes de la tarea "Módulo HTTP SSE": les añade
 * la descripción en Markdown y las marca como completadas.
 * Requiere CLICKUP_API_TOKEN en gateway/.env
 *
 * Uso (desde gateway/):
 *   node scripts/clickup/seeds/finish-http-sse-subtasks.cjs --task-id 86afm65jy
 */
const { loadGatewayEnv, requireDist } = require('../../_shared/script-env.cjs');
loadGatewayEnv();

const { getTask, getList, updateTask, hasClickUpToken } = requireDist(['clickup-client.js', 'clickup']);
const { SUBTASKS } = require('./seed-subtasks-http-streamable.cjs');

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

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { taskId: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task-id' && args[i + 1]) {
      out.taskId = args[i + 1].trim();
      i++;
    }
  }
  return out;
}

async function main() {
  const opts = parseArgs();
  if (!opts.taskId) {
    console.error('Uso: node scripts/finish-http-sse-subtasks.cjs --task-id <task_id>');
    process.exit(1);
  }
  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
    process.exit(1);
  }

  const task = await getTask(opts.taskId, { include_subtasks: true });
  const subtasks = task.subtasks || [];
  if (!subtasks.length) {
    console.log('La tarea no tiene subtareas. Nada que actualizar.');
    return;
  }

  const listId = task.list?.id;
  if (!listId) {
    console.error('No se pudo obtener la lista de la tarea.');
    process.exit(1);
  }
  const list = await getList(listId);
  const completeStatus = findCompleteStatus(list);
  console.log('Tarea padre:', task.name || task.id);
  console.log('Subtareas:', subtasks.length, '| Status completado:', completeStatus);

  let updated = 0;
  for (let i = 0; i < subtasks.length; i++) {
    const sub = subtasks[i];
    const info = SUBTASKS[i];
    if (!info) {
      console.log('  [', i + 1, ']', sub.name || sub.id, '→ sin descripción en datos, solo estado');
      await updateTask(sub.id, { status: completeStatus });
      updated++;
      continue;
    }
    await updateTask(sub.id, {
      markdown_description: info.description,
      status: completeStatus,
    });
    console.log('  OK:', info.title);
    updated++;
  }
  console.log('\nListo.', updated, 'subtareas actualizadas con descripción y estado "' + completeStatus + '".');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
