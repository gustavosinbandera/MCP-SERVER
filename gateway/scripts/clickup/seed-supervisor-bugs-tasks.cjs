/**
 * Crea en ClickUp las 9 tareas del plan "Agente supervisor de bugs".
 * Requiere CLICKUP_API_TOKEN en gateway/.env
 * Uso: desde gateway/ → node scripts/seed-supervisor-bugs-tasks.cjs
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const {
  getTeams,
  getSpaces,
  getFolders,
  getLists,
  createTask,
  getAuthorizedUser,
  hasClickUpToken,
} = require('../dist/clickup-client.js');

const TASKS = [
  { name: 'SB-1 Lista ClickUp para bugs y convención BUG-Título', description: 'Definir lista donde se crean bugs y convención: tareas con título BUG-Título para detectarlas.' },
  { name: 'SB-2 Resolución de lista y filtro de tareas BUG-*', description: 'Obtener listId (LIST_ID o descubrir) y filtrar tareas cuyo name empiece por BUG-.' },
  { name: 'SB-3 Detección de tareas ya procesadas', description: 'Comprobar si la descripción ya contiene bloque "Solución sugerida" para omitir o re-procesar.' },
  { name: 'SB-4 Módulo de búsqueda de código relevante', description: 'Dado título y descripción del bug, devolver archivos o fragmentos de código del repo a revisar.' },
  { name: 'SB-5 Módulo generación de solución con LLM', description: 'OpenAI chat: system prompt experto MCP/DevOps/JS + user prompt con bug y código; salida Markdown.' },
  { name: 'SB-6 Actualización de tarea con markdown_description', description: 'Añadir sección "Solución sugerida" a la descripción de la tarea en ClickUp.' },
  { name: 'SB-7 Script orquestador supervisor-bugs', description: 'Listar → filtrar BUG-* → por cada una: leer descripción, buscar código, generar solución, actualizar tarea.' },
  { name: 'SB-8 Configuración .env y documentación', description: 'OPENAI_API_KEY, LIST_ID opcional, documentar uso del supervisor de bugs.' },
  { name: 'SB-9 Ejecución periódica del supervisor', description: 'Cron, Task Scheduler o integración con proceso existente para lanzar el supervisor cada X tiempo.' },
];

async function resolveListId() {
  const listId = process.env.LIST_ID?.trim();
  if (listId) return listId;
  console.log('LIST_ID no definido; descubriendo workspace → space → folder → list...');
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
