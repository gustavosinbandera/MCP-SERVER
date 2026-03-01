/**
 * Marca las 35 tareas como completadas y rellena: tiempo estimado, track time,
 * prioridad alta, tags y relaciones (cada tarea enlazada a la siguiente).
 * Uso: desde gateway/ → node scripts/clickup-tasks-to-finished.cjs
 * Opcional en .env: CLICKUP_TAG=entregable (el tag debe existir en el workspace).
 */
const path = require('path');
const { loadGatewayEnv, requireDist } = require('../_shared/script-env.cjs');
loadGatewayEnv();

const {
  getTeams,
  getSpaces,
  getFolders,
  getLists,
  getList,
  getTasks,
  updateTask,
  addTagToTask,
  createTimeEntry,
  addTaskLink,
  hasClickUpToken,
} = requireDist(['clickup-client.js', 'clickup']);

const TASK_NAMES = [
  '1.1 CloudFormation: stack EC2 y Security Group',
  '1.2 Setup remoto EC2: Docker y proyecto',
  '1.3 Route53: registro mcp y actualización de IP',
  '1.4 Util scripts EC2: update-repo e instalación',
  '2.1 INDEX_INBOX y processInbox',
  '2.2 SHARED_DIRS y one-time (classic, blueivory)',
  '2.3 Indexación por URL (index_url, index_site)',
  '2.4 Estadísticas de indexación por día (SQLite)',
  '2.5 Chunking y code-metadata',
  '2.6 Embeddings y búsqueda semántica',
  '3.1 Herramientas de búsqueda (search_docs, count_docs)',
  '3.2 Herramientas de indexación y view_url',
  '3.3 ClickUp: cliente API y 8 herramientas MCP',
  '3.4 Repo/git y búsqueda GitHub',
  '3.5 Shared dirs: list_shared_dir, read_shared_file',
  '4.1 Tests: chunking',
  '4.2 Tests: code-chunking',
  '4.3 Tests: code-metadata',
  '4.4 Tests: config',
  '4.5 Tests: embedding',
  '4.6 Tests: flow-doc',
  '4.7 Tests: index (gateway)',
  '4.8 Tests: indexed-keys-db',
  '4.9 Tests: indexing-stats',
  '4.10 Tests: logger',
  '4.11 Tests: search',
  '4.12 Tests: shared-dirs',
  '5.1 Doc: CLICKUP-API-REFERENCE',
  '5.2 Doc: COMANDOS-INSTANCIA-EC2',
  '5.3 Doc: SYNC-Y-INDEXACION-DEPLOYS',
  '5.4 Doc: REVISION-INDEXADOR y SUGERENCIAS-INDEXACION',
  '5.5 Doc: Herramientas MCP (tools/)',
  '5.6 Doc: TESTING y validación por fases',
  '6.1 Docker Compose: definición de servicios',
  '6.2 Migraciones y arranque de datastores',
];

const ONE_HOUR_MS = 60 * 60 * 1000;
const PRIORITY_HIGH = 2; // 1=urgent, 2=high, 3=normal, 4=low

async function resolveListAndTeam() {
  const listId = process.env.LIST_ID?.trim();
  if (listId) {
    const teams = await getTeams();
    if (!teams.length) throw new Error('No hay workspaces.');
    const team = teams.find((t) => t.name && t.name.includes('MCP-SERVER')) || teams[0];
    return { listId, teamId: String(team.id) };
  }
  const teams = await getTeams();
  if (!teams.length) throw new Error('No hay workspaces.');
  const team = teams.find((t) => t.name && t.name.includes('MCP-SERVER')) || teams[0];
  const teamId = String(team.id);
  const spaces = await getSpaces(teamId);
  if (!spaces.length) throw new Error('No hay spaces.');
  const folders = await getFolders(spaces[0].id);
  if (!folders.length) throw new Error('No hay folders.');
  const lists = await getLists(folders[0].id);
  if (!lists.length) throw new Error('No hay listas.');
  return { listId: lists[0].id, teamId };
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

async function main() {
  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
    process.exit(1);
  }

  const { listId, teamId } = await resolveListAndTeam();
  console.log('Lista:', listId, '| Workspace (team_id):', teamId);

  const [list, tasks] = await Promise.all([getList(listId), getTasks(listId)]);
  const completeStatus = findCompleteStatus(list);
  console.log('Status "completadas":', completeStatus);

  const tagName = process.env.CLICKUP_TAG?.trim() || 'entregable';
  const taskOrder = [];
  const byName = new Map(tasks.map((t) => [t.name, t]));
  for (const name of TASK_NAMES) {
    const t = byName.get(name);
    if (t) taskOrder.push(t);
    else console.warn('No encontrada:', name);
  }

  if (taskOrder.length === 0) {
    console.error('No se encontró ninguna tarea. ¿Ejecutaste seed-clickup-tasks.cjs?');
    process.exit(1);
  }

  console.log('Tareas en orden:', taskOrder.length);
  const now = Date.now();
  const oneHourAgo = now - ONE_HOUR_MS;

  for (let i = 0; i < taskOrder.length; i++) {
    const task = taskOrder[i];
    const n = i + 1;
    console.log(`[${n}/${taskOrder.length}] ${task.name}`);

    await updateTask(task.id, {
      status: completeStatus,
      priority: PRIORITY_HIGH,
      time_estimate: ONE_HOUR_MS,
    });

    try {
      await createTimeEntry(teamId, {
        task_id: task.id,
        duration: ONE_HOUR_MS,
        start: oneHourAgo,
        description: task.name,
        billable: false,
      });
    } catch (err) {
      console.warn('  Track time:', err.message || err);
    }

    try {
      await addTagToTask(task.id, tagName, teamId);
    } catch (err) {
      console.warn('  Tag "' + tagName + '":', err.message || err, '(crea el tag en ClickUp si quieres usarlo)');
    }

    if (i < taskOrder.length - 1) {
      try {
        await addTaskLink(task.id, taskOrder[i + 1].id);
      } catch (err) {
        console.warn('  Link:', err.message || err);
      }
    }
  }

  console.log('\nListo. Tareas en "' + completeStatus + '", prioridad alta, 1h estimado/track, tag "' + tagName + '", enlaces en secuencia.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
