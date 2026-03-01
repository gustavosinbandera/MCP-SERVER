/**
 * Pone cada una de las 35 tareas en estado "in progress" y actualiza la descripción
 * con lo realizado: qué se hizo, código, cómo usar, cómo testear (MD con bloques de código).
 * Uso: desde gateway/ → node scripts/update-clickup-tasks-in-progress.cjs
 * Requiere: CLICKUP_API_TOKEN, lista con las 35 tareas ya creadas (seed-clickup-tasks.cjs).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const {
  getTeams,
  getSpaces,
  getFolders,
  getLists,
  getList,
  getTasks,
  updateTask,
  hasClickUpToken,
} = require('../dist/clickup-client.js');

// Orden y nombres exactos de las 35 tareas (deben coincidir con getTasks)
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

// Descripciones en Markdown (con bloques de código y lenguajes para resaltado)
const DESCRIPTIONS = [
  // 1.1
  `## Qué se hizo
Stack CloudFormation para instancia EC2 y Security Group (SSH 22, HTTP 80, HTTPS 443).

## Código / archivos
- \`infra/mcp-ec2.yaml\` – plantilla
- \`infra/1-create-stack.ps1\`, \`2-get-outputs.ps1\`, \`3-delete-stack.ps1\` – scripts
- Parámetros y outputs (IP, InstanceId)

## Cómo usar
Orden de ejecución: 1 → 2 (obtener IP) → 3 para eliminar.

\`\`\`powershell
.\\infra\\1-create-stack.ps1
.\\infra\\2-get-outputs.ps1
.\\infra\\3-delete-stack.ps1
\`\`\`

## Cómo testear
Crear stack, ver outputs; eliminar stack y comprobar que se borra.`,

  // 1.2
  `## Qué se hizo
Script para configurar la instancia EC2: instalación Docker en Amazon Linux, clonado/copia del proyecto, \`docker compose up -d\`.

## Código / archivos
- \`infra/4-setup-remote.ps1\`

## Cómo usar
Ejecutar desde local contra la IP de la instancia (SSH). Requiere clave y acceso SSH.

\`\`\`powershell
.\\infra\\4-setup-remote.ps1
\`\`\`

## Cómo testear
SSH a la instancia y comprobar que los servicios están levantados.

\`\`\`bash
ssh -i infra/mcp-server-key.pem ec2-user@<IP>
docker compose ps
\`\`\``,

  // 1.3
  `## Qué se hizo
Registro DNS (Route53) para dominio mcp (ej. mcp.domoticore.co) apuntando a la IP del stack.

## Código / archivos
- \`infra/5-route53-mcp.ps1\`, \`infra/route53-mcp-record-temp.json\` (generado)

## Cómo usar
Ejecutar después de crear el stack; obtener hosted zone id desde la consola AWS.

\`\`\`powershell
.\\infra\\5-route53-mcp.ps1
\`\`\`

## Cómo testear
Comprobar que el DNS resuelve a la IP de la instancia.

\`\`\`bash
nslookup mcp.domoticore.co
\`\`\``,

  // 1.4
  `## Qué se hizo
Scripts de utilidad en la instancia: update-repo (pull, build, restart), install-tools.sh (PATH y aliases en \`/opt/mcp-tools\`).

## Código / archivos
- \`scripts/ec2/util_update_repo\`, \`scripts/ec2/install-tools.sh\`

## Cómo usar
En EC2: \`update-repo\` tras hacer pull; ver COMANDOS-INSTANCIA-EC2 sección "Util scripts".

\`\`\`bash
cd ~/MCP-SERVER
sudo bash scripts/ec2/install-tools.sh
# luego: update-repo  o  util_update_repo
\`\`\`

## Cómo testear
Ejecutar en EC2 y comprobar que el reinicio de servicios se realiza correctamente.`,

  // 2.1
  `## Qué se hizo
Supervisor procesa carpeta INDEX_INBOX: chunking, embeddings, upsert en Qdrant; luego borra/mueve archivos.

## Código / archivos
- \`gateway/src/inbox-indexer.ts\`, \`gateway/src/supervisor.ts\`

## Cómo usar
Poner archivos en INDEX_INBOX; el supervisor los indexa en el siguiente ciclo.

## Cómo testear
Revisar logs y usar count_docs para verificar documentos indexados.

\`\`\`bash
docker compose logs supervisor --tail=50
\`\`\``,

  // 2.2
  `## Qué se hizo
Carpetas compartidas classic/blueivory: indexación por ciclo; one-time en SQLite para no reindexar ya indexado.

## Código / archivos
- \`gateway/src/shared-dirs.ts\`, \`gateway/src/one-time-indexed-db.ts\`

## Cómo usar
Configurar SHARED_DIRS en .env; el supervisor indexa en cada ciclo.

\`\`\`bash
# .env
SHARED_DIRS=classic|/ruta/classic,blueivory|/ruta/blueivory
\`\`\`

## Cómo testear
\`shared-dirs.test.ts\` y ejecutar ciclo del supervisor.`,

  // 2.3
  `## Qué se hizo
Herramientas MCP y módulo para indexar una URL o un sitio completo; opción render_js; límite de páginas.

## Código / archivos
- \`gateway/src/url-indexer.ts\`, mcp-server (index_url, index_site)

## Cómo usar
Desde MCP: index_url / index_site con la URL y parámetros.

## Cómo testear
Indexar una URL y buscar con search_docs.`,

  // 2.4
  `## Qué se hizo
Estadísticas diarias de indexación (inbox, shared_new, shared_reindexed, url) en SQLite; endpoint GET /stats/indexing; logs indexing_daily.

## Código / archivos
- \`gateway/src/indexing-stats.ts\`, \`gateway/src/index.ts\`, supervisor

## Cómo usar
GET /stats/indexing con query \`days\` (1–365).

\`\`\`bash
curl "http://localhost:3000/stats/indexing?days=7"
\`\`\`

## Cómo testear
\`\`\`bash
cd gateway && npm run test -- indexing-stats.test.ts
\`\`\``,

  // 2.5
  `## Qué se hizo
Fragmentación de texto y código; metadatos para código (clases, archivo).

## Código / archivos
- \`gateway/src/chunking.ts\`, \`gateway/src/code-chunking.ts\`, \`gateway/src/code-metadata.ts\`

## Cómo usar
Usado internamente por el indexador.

## Cómo testear
\`\`\`bash
npm run test -- chunking.test.ts
npm run test -- code-chunking.test.ts
npm run test -- code-metadata.test.ts
\`\`\``,

  // 2.6
  `## Qué se hizo
OpenAI embeddings, búsqueda por similitud en Qdrant; filtros opcionales.

## Código / archivos
- \`gateway/src/embedding.ts\`, \`gateway/src/search.ts\`, \`gateway/src/qdrant-client.ts\`

## Cómo usar
Herramienta MCP search_docs con query y filtros.

## Cómo testear
\`\`\`bash
npm run test -- embedding.test.ts
npm run test -- search.test.ts
\`\`\``,

  // 3.1
  `## Qué se hizo
Búsqueda semántica y conteo de puntos en Qdrant; filtros por project, branch, etc.

## Código / archivos
- mcp-server (search_docs, count_docs), \`gateway/src/search.ts\`

## Cómo usar
Desde Cursor / MCP: invocar search_docs o count_docs.

## Cómo testear
\`\`\`bash
npm run test -- search.test.ts
\`\`\``,

  // 3.2
  `## Qué se hizo
index_url, index_site, index_url_with_links; view_url con opción render_js (Puppeteer).

## Código / archivos
- mcp-server, \`gateway/src/url-indexer.ts\`, \`gateway/src/fetch-with-browser.ts\`

## Cómo usar
Herramientas MCP desde el cliente.

## Cómo testear
\`\`\`bash
npm run test -- index.test.ts
\`\`\`
Y pruebas manuales con index_url / view_url.`,

  // 3.3
  `## Qué se hizo
Cliente ClickUp API v2 y 8 herramientas MCP: list_workspaces, list_spaces, list_folders, list_lists, list_tasks, create_task, get_task, update_task, create_subtask.

## Código / archivos
- \`gateway/src/clickup-client.ts\`, mcp-server (clickup_*)

## Cómo usar
CLICKUP_API_TOKEN en .env; invocar herramientas desde MCP.

## Cómo testear
\`\`\`bash
node gateway/scripts/create-clickup-example-task.cjs
node gateway/scripts/seed-clickup-tasks.cjs
\`\`\``,

  // 3.4
  `## Qué se hizo
Herramientas repo_git y search_github_repos para operaciones git y búsqueda en GitHub.

## Código / archivos
- \`gateway/src/repo-git.ts\`, \`gateway/src/github-search.ts\`, mcp-server

## Cómo usar
Desde MCP con los parámetros documentados en gateway/docs/tools.

## Cómo testear
Manual o tests si existen.`,

  // 3.5
  `## Qué se hizo
Listar y leer archivos de carpetas compartidas (classic, blueivory).

## Código / archivos
- mcp-server, \`gateway/src/shared-dirs.ts\`

## Cómo usar
Herramientas MCP list_shared_dir y read_shared_file.

## Cómo testear
\`\`\`bash
npm run test -- shared-dirs.test.ts
\`\`\``,

  // 4.1 – 4.12 tests
  `## Qué valida
Fragmentación de texto (tamaño, solapamiento, límites).

## Código
\`gateway/src/chunking.test.ts\`

## Cómo ejecutar
\`\`\`bash
cd gateway && npm run test -- chunking.test.ts
\`\`\`

## Completado
Todos los tests pasan.`,

  `## Qué valida
Chunking de código (funciones, clases).

## Código
\`gateway/src/code-chunking.test.ts\`

## Cómo ejecutar
\`\`\`bash
npm run test -- code-chunking.test.ts
\`\`\`

## Completado
Todos los tests pasan.`,

  `## Qué valida
Extracción de nombres de clase y tipos referenciados.

## Código
\`gateway/src/code-metadata.test.ts\`

## Cómo ejecutar
\`\`\`bash
npm run test -- code-metadata.test.ts
\`\`\`

## Completado
Todos los tests pasan.`,

  `## Qué valida
Carga de configuración desde env.

## Código
\`gateway/src/config.test.ts\`

## Cómo ejecutar
\`\`\`bash
npm run test -- config.test.ts
\`\`\`

## Completado
Todos los tests pasan.`,

  `## Qué valida
Generación de embeddings (mock o clave).

## Código
\`gateway/src/embedding.test.ts\`

## Cómo ejecutar
\`\`\`bash
npm run test -- embedding.test.ts
\`\`\`

## Completado
Todos los tests pasan.`,

  `## Qué valida
Flujo de documentos.

## Código
\`gateway/src/flow-doc.test.ts\`

## Cómo ejecutar
\`\`\`bash
npm run test -- flow-doc.test.ts
\`\`\`

## Completado
Todos los tests pasan.`,

  `## Qué valida
Rutas HTTP del gateway.

## Código
\`gateway/src/index.test.ts\`

## Cómo ejecutar
\`\`\`bash
npm run test -- index.test.ts
\`\`\`

## Completado
Todos los tests pasan.`,

  `## Qué valida
DB de claves indexadas.

## Código
\`gateway/src/indexed-keys-db.test.ts\`

## Cómo ejecutar
\`\`\`bash
npm run test -- indexed-keys-db.test.ts
\`\`\`

## Completado
Todos los tests pasan.`,

  `## Qué valida
Estadísticas por día (SQLite).

## Código
\`gateway/src/indexing-stats.test.ts\`

## Cómo ejecutar
\`\`\`bash
npm run test -- indexing-stats.test.ts
\`\`\`

## Completado
Todos los tests pasan.`,

  `## Qué valida
Logger.

## Código
\`gateway/src/logger.test.ts\`

## Cómo ejecutar
\`\`\`bash
npm run test -- logger.test.ts
\`\`\`

## Completado
Todos los tests pasan.`,

  `## Qué valida
Búsqueda semántica y filtros.

## Código
\`gateway/src/search.test.ts\`

## Cómo ejecutar
\`\`\`bash
npm run test -- search.test.ts
\`\`\`

## Completado
Todos los tests pasan.`,

  `## Qué valida
Resolución de directorios compartidos.

## Código
\`gateway/src/shared-dirs.test.ts\`

## Cómo ejecutar
\`\`\`bash
npm run test -- shared-dirs.test.ts
\`\`\`

## Completado
Todos los tests pasan.`,

  // 5.1 – 5.6 docs
  `## Qué se hizo
Referencia API ClickUp (auth, endpoints, errores).

## Código / archivos
- \`docs/CLICKUP-API-REFERENCE.md\`

## Qué cubre
Auth (token pk_), /user, /team, /space, /folder, /list, /task (GET/POST/PUT).

## Cómo usar
Consulta al integrar ClickUp (MCP o scripts).`,

  `## Qué se hizo
Comandos SSH, servicios, logs, reinicio, Qdrant, SQLite, ClickUp token.

## Código / archivos
- \`docs/COMANDOS-INSTANCIA-EC2.md\`

## Qué cubre
Conexión SSH, docker compose, logs, util scripts (update-repo), count_docs, /stats/indexing.

## Cómo usar
Operación diaria en EC2.`,

  `## Qué se hizo
Sincronización de código e indexación en deploys.

## Código / archivos
- \`docs/SYNC-Y-INDEXACION-DEPLOYS.md\`

## Qué cubre
Flujo sync e indexación tras deploy.

## Cómo usar
Guía de despliegue.`,

  `## Qué se hizo
Revisión del indexador y sugerencias (metadata, chunking).

## Código / archivos
- \`gateway/docs/REVISION-INDEXADOR.md\`, \`gateway/docs/SUGERENCIAS-INDEXACION.md\`

## Qué cubre
Arquitectura indexador, one-time, SHARED_DIRS.

## Cómo usar
Referencia para cambios en indexación.`,

  `## Qué se hizo
Documentación por herramienta MCP.

## Código / archivos
- \`gateway/docs/tools/\` (README y archivos por herramienta)

## Qué cubre
Parámetros y ejemplos de cada herramienta.

## Cómo usar
Referencia para usuarios del MCP.`,

  `## Qué se hizo
Cómo escribir y ejecutar tests; validación por fases.

## Código / archivos
- \`gateway/docs/TESTING.md\`, \`validate_phase*.ps1\`, \`validate_all.ps1\`

## Qué cubre
npm run test, fases de validación, CI o local.

## Cómo usar
CI o ejecución local.`,

  // 6.1, 6.2
  `## Qué se hizo
Definición de servicios: postgres, redis, qdrant, influxdb, grafana, gateway, supervisor, webapp, nginx.

## Código / archivos
- \`docker-compose.yml\`, Dockerfiles

## Cómo usar
\`\`\`bash
docker compose up -d
\`\`\`

## Cómo testear
Comprobar que los servicios están healthy.

\`\`\`bash
docker compose ps
\`\`\``,

  `## Qué se hizo
Scripts run_migrations.ps1, start_datastores.ps1; esquema SQL en scripts/sql/.

## Código / archivos
- scripts y SQL

## Cómo usar
Ejecutar antes de gateway/supervisor (orden de arranque).

## Cómo testear
Postgres/Redis/Qdrant accesibles.`,
];

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

/** Encuentra el nombre del status "in progress" en la lista (inglés o español). */
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

async function main() {
  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
    process.exit(1);
  }

  const listId = await resolveListId();
  console.log('Lista:', listId);

  const [list, tasks] = await Promise.all([getList(listId), getTasks(listId)]);
  const inProgressStatus = findInProgressStatus(list);
  console.log('Status "en progreso":', inProgressStatus);

  const byName = new Map(tasks.map((t) => [t.name, t]));
  if (TASK_NAMES.length !== DESCRIPTIONS.length) {
    throw new Error('TASK_NAMES y DESCRIPTIONS deben tener la misma longitud');
  }

  for (let i = 0; i < TASK_NAMES.length; i++) {
    const name = TASK_NAMES[i];
    const task = byName.get(name);
    if (!task) {
      console.warn(`[${i + 1}/35] No encontrada: ${name}`);
      continue;
    }
    const description = DESCRIPTIONS[i];
    console.log(`[${i + 1}/35] ${name}`);
    await updateTask(task.id, {
      status: inProgressStatus,
      markdown_description: description,
    });
  }

  console.log('\nListo. 35 tareas actualizadas: status "' + inProgressStatus + '" y descripción con MD.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
