/**
 * Crea en ClickUp todas las tareas de entregables MCP-SERVER (trabajo realizado).
 * Requiere CLICKUP_API_TOKEN en gateway/.env
 * Opcional: LIST_ID (lista destino), ASSIGNEE_USER_ID (tu user id). Si no se pasan, se descubre lista y se usa el usuario autorizado.
 * Uso: desde gateway/ → node scripts/seed-clickup-tasks.cjs
 * Ver docs/CLICKUP-TAREAS-ENTREGABLES.md para plantillas completas al documentar cada tarea.
 */
const path = require('path');
const { loadGatewayEnv, requireDist } = require('../_shared/script-env.cjs');
loadGatewayEnv();

const {
  getTeams,
  getSpaces,
  getFolders,
  getLists,
  createTask,
  getAuthorizedUser,
  hasClickUpToken,
} = requireDist(['clickup-client.js', 'clickup']);

const TASKS = [
  { name: '1.1 CloudFormation: stack EC2 y Security Group', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 1.1. Infra: mcp-ec2.yaml, scripts 1–3.' },
  { name: '1.2 Setup remoto EC2: Docker y proyecto', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 1.2. Script 4-setup-remote.ps1.' },
  { name: '1.3 Route53: registro mcp y actualización de IP', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 1.3. Scripts 5-route53-mcp.ps1 y JSON.' },
  { name: '1.4 Util scripts EC2: update-repo e instalación', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 1.4. util_update_repo, install-tools.sh.' },
  { name: '2.1 INDEX_INBOX y processInbox', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 2.1. inbox-indexer, supervisor.' },
  { name: '2.2 SHARED_DIRS y one-time (classic, blueivory)', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 2.2. shared-dirs, one-time-indexed-db.' },
  { name: '2.3 Indexación por URL (index_url, index_site)', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 2.3. url-indexer, mcp-server.' },
  { name: '2.4 Estadísticas de indexación por día (SQLite)', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 2.4. indexing-stats, GET /stats/indexing.' },
  { name: '2.5 Chunking y code-metadata', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 2.5. chunking, code-chunking, code-metadata.' },
  { name: '2.6 Embeddings y búsqueda semántica', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 2.6. embedding, search, qdrant-client.' },
  { name: '3.1 Herramientas de búsqueda (search_docs, count_docs)', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 3.1. mcp-server, search.' },
  { name: '3.2 Herramientas de indexación y view_url', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 3.2. index_url, index_site, view_url.' },
  { name: '3.3 ClickUp: cliente API y 8 herramientas MCP', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 3.3. clickup-client, mcp-server clickup_*.' },
  { name: '3.4 Repo/git y búsqueda GitHub', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 3.4. repo-git, github-search.' },
  { name: '3.5 Shared dirs: list_shared_dir, read_shared_file', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 3.5. mcp-server, shared-dirs.' },
  { name: '4.1 Tests: chunking', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 4.1. chunking.test.ts.' },
  { name: '4.2 Tests: code-chunking', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 4.2. code-chunking.test.ts.' },
  { name: '4.3 Tests: code-metadata', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 4.3. code-metadata.test.ts.' },
  { name: '4.4 Tests: config', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 4.4. config.test.ts.' },
  { name: '4.5 Tests: embedding', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 4.5. embedding.test.ts.' },
  { name: '4.6 Tests: flow-doc', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 4.6. flow-doc.test.ts.' },
  { name: '4.7 Tests: index (gateway)', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 4.7. index.test.ts.' },
  { name: '4.8 Tests: indexed-keys-db', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 4.8. indexed-keys-db.test.ts.' },
  { name: '4.9 Tests: indexing-stats', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 4.9. indexing-stats.test.ts.' },
  { name: '4.10 Tests: logger', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 4.10. logger.test.ts.' },
  { name: '4.11 Tests: search', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 4.11. search.test.ts.' },
  { name: '4.12 Tests: shared-dirs', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 4.12. shared-dirs.test.ts.' },
  { name: '5.1 Doc: CLICKUP-API-REFERENCE', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 5.1. docs/CLICKUP-API-REFERENCE.md.' },
  { name: '5.2 Doc: COMANDOS-INSTANCIA-EC2', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 5.2. docs/COMANDOS-INSTANCIA-EC2.md.' },
  { name: '5.3 Doc: SYNC-Y-INDEXACION-DEPLOYS', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 5.3. docs/SYNC-Y-INDEXACION-DEPLOYS.md.' },
  { name: '5.4 Doc: REVISION-INDEXADOR y SUGERENCIAS-INDEXACION', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 5.4. gateway/docs/.' },
  { name: '5.5 Doc: Herramientas MCP (tools/)', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 5.5. gateway/docs/tools/.' },
  { name: '5.6 Doc: TESTING y validación por fases', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 5.6. TESTING.md, validate_phase*.ps1.' },
  { name: '6.1 Docker Compose: definición de servicios', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 6.1. docker-compose.yml, Dockerfiles.' },
  { name: '6.2 Migraciones y arranque de datastores', description: 'Plantilla en docs/CLICKUP-TAREAS-ENTREGABLES.md § 6.2. run_migrations.ps1, start_datastores.ps1, scripts/sql/.' },
];

async function resolveListId() {
  const listId = process.env.LIST_ID?.trim();
  if (listId) return listId;

  console.log('LIST_ID no definido; descubriendo workspace → space → folder → list...');
  const teams = await getTeams();
  if (!teams.length) throw new Error('No hay workspaces.');
  const team = teams.find((t) => t.name && t.name.includes('MCP-SERVER')) || teams[0];
  const teamId = String(team.id);

  const spaces = await getSpaces(teamId);
  if (!spaces.length) throw new Error('No hay spaces.');
  const space = spaces[0];
  const folders = await getFolders(space.id);
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
  console.log('ASSIGNEE_USER_ID no definido; obteniendo usuario autorizado...');
  const user = await getAuthorizedUser();
  if (user.id != null) return user.id;
  throw new Error('No se pudo obtener user id para asignación. Define ASSIGNEE_USER_ID en .env');
}

async function main() {
  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
    process.exit(1);
  }

  const listId = await resolveListId();
  console.log('Lista destino:', listId);

  const assigneeId = await resolveAssigneeId();
  console.log('Asignar a user_id:', assigneeId);

  const created = [];
  for (let i = 0; i < TASKS.length; i++) {
    const { name, description } = TASKS[i];
    console.log(`[${i + 1}/${TASKS.length}] Creando: ${name}`);
    const task = await createTask(listId, {
      name,
      description: description || undefined,
      assignees: [assigneeId],
    });
    created.push({ name, id: task.id, url: 'https://app.clickup.com/t/' + task.id });
  }

  console.log('\nCreadas', created.length, 'tareas. URLs:');
  created.forEach((t) => console.log('  ', t.url, '-', t.name));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
