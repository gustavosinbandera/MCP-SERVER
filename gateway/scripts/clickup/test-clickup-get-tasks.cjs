/**
 * Prueba rápida de getTasks (con y sin filtro statuses).
 * Uso: desde gateway/ → node scripts/test-clickup-get-tasks.cjs
 */
const path = require('path');
const { loadGatewayEnv, requireDist } = require('../_shared/script-env.cjs');
loadGatewayEnv();

const { getTasks, getList, hasClickUpToken } = requireDist(['clickup-client.js', 'clickup']);

async function main() {
  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no definido');
    process.exit(1);
  }
  const listId = process.env.LIST_ID || '901325668563';

  const tasks = await getTasks(listId);
  console.log('getTasks(listId) sin filtro:', tasks.length, 'tareas');

  const list = await getList(listId);
  const statuses = (list.statuses || []).map((s) => s.status);
  console.log('Estados en la lista:', statuses.slice(0, 5).join(', ') + (statuses.length > 5 ? '...' : ''));

  if (statuses.length) {
    const firstStatus = statuses[0];
    const conFiltro = await getTasks(listId, { statuses: firstStatus });
    console.log('getTasks(listId, { statuses: "' + firstStatus + '" }):', conFiltro.length, 'tareas');
  }
  console.log('OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
