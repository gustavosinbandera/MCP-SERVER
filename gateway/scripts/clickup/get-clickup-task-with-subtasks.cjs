/**
 * Obtiene la tarea padre y sus subtareas desde ClickUp.
 * Requiere CLICKUP_API_TOKEN en gateway/.env
 *
 * Uso (desde gateway/):
 *   node scripts/get-clickup-task-with-subtasks.cjs --task-id 86afm65jy
 *   node scripts/get-clickup-task-with-subtasks.cjs --task-id 86afm65jy --json
 */
const path = require('path');
const { loadGatewayEnv, requireDist } = require('../_shared/script-env.cjs');
loadGatewayEnv();

const { getTask, hasClickUpToken } = requireDist(['clickup-client.js', 'clickup']);

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { taskId: null, json: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--task-id' && args[i + 1]) {
      out.taskId = args[i + 1].trim();
      i++;
    } else if (args[i] === '--json') {
      out.json = true;
    }
  }
  return out;
}

async function main() {
  const opts = parseArgs();
  if (!opts.taskId) {
    console.error('Uso: node scripts/get-clickup-task-with-subtasks.cjs --task-id <task_id> [--json]');
    process.exit(1);
  }
  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
    process.exit(1);
  }

  const task = await getTask(opts.taskId, { include_subtasks: true });
  const subtasks = task.subtasks || [];

  if (opts.json) {
    console.log(JSON.stringify({ task: { id: task.id, name: task.name, list: task.list }, subtasks }, null, 2));
    return;
  }

  console.log('Tarea padre:', task.name || task.id);
  console.log('URL: https://app.clickup.com/t/' + task.id);
  console.log('Subtareas:', subtasks.length);
  subtasks.forEach((s, i) => {
    console.log('  ', i + 1 + '.', s.name || s.id, '→ https://app.clickup.com/t/' + s.id);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
