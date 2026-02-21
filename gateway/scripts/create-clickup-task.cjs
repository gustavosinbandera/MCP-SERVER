/**
 * Script genérico para crear tareas (y opcionalmente subtareas) en ClickUp.
 * Requiere CLICKUP_API_TOKEN en gateway/.env
 * Opcionales en .env: LIST_ID, ASSIGNEE_USER_ID (por defecto lista y usuario autorizado).
 *
 * Uso (desde gateway/):
 *   node scripts/create-clickup-task.cjs --title "Título de la tarea"
 *   node scripts/create-clickup-task.cjs --title "Título" --description "Descripción en texto plano"
 *   node scripts/create-clickup-task.cjs --title "Título" --markdown-file docs/tarea.md
 *   node scripts/create-clickup-task.cjs --title "Título" --subtasks "Sub1,Sub2,Sub3"
 *   node scripts/create-clickup-task.cjs --title "Título" --subtasks-file subtareas.txt
 *   node scripts/create-clickup-task.cjs --title "Título" --list-id 901325668563 --priority 2
 *
 * Opciones:
 *   --title "..."           (requerido) Nombre de la tarea
 *   --description "..."     Descripción en texto plano
 *   --description-file path Descripción leyendo el archivo (texto plano)
 *   --markdown "..."        Descripción en Markdown (ClickUp la renderiza)
 *   --markdown-file path    Descripción en Markdown leyendo el archivo
 *   --subtasks "A,B,C"      Subtareas separadas por comas (crea tarea + subtareas)
 *   --subtasks-file path    Una subtarea por línea (ignora líneas vacías)
 *   --list-id id            Lista ClickUp (si no está LIST_ID en .env, se resuelve automático)
 *   --assignee id           User ID asignado (si no, usuario autorizado)
 *   --priority 1|2|3|4      ClickUp: 1=urgent, 2=high, 3=normal, 4=low
 *   --status "nombre"       Estado inicial (debe existir en la lista)
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const {
  getTeams,
  getSpaces,
  getFolders,
  getLists,
  createTask,
  createSubtask,
  getAuthorizedUser,
  hasClickUpToken,
} = require('../dist/clickup-client.js');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    title: null,
    description: null,
    markdown: null,
    descriptionFile: null,
    markdownFile: null,
    subtasks: null,
    subtasksFile: null,
    listId: null,
    assignee: null,
    priority: null,
    status: null,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[i + 1];
    if (a === '--title' && next()) {
      out.title = next();
      i++;
    } else if (a === '--description' && next()) {
      out.description = next();
      i++;
    } else if (a === '--description-file' && next()) {
      out.descriptionFile = next();
      i++;
    } else if (a === '--markdown' && next()) {
      out.markdown = next();
      i++;
    } else if (a === '--markdown-file' && next()) {
      out.markdownFile = next();
      i++;
    } else if (a === '--subtasks' && next()) {
      out.subtasks = next().split(',').map((s) => s.trim()).filter(Boolean);
      i++;
    } else if (a === '--subtasks-file' && next()) {
      out.subtasksFile = next();
      i++;
    } else if (a === '--list-id' && next()) {
      out.listId = next().trim();
      i++;
    } else if (a === '--assignee' && next()) {
      const n = parseInt(next(), 10);
      if (!Number.isNaN(n)) out.assignee = n;
      i++;
    } else if (a === '--priority' && next()) {
      const n = parseInt(next(), 10);
      if (!Number.isNaN(n) && n >= 1 && n <= 4) out.priority = n;
      i++;
    } else if (a === '--status' && next()) {
      out.status = next();
      i++;
    }
  }
  return out;
}

function readDescription(opts) {
  if (opts.markdown != null) return { markdown_description: opts.markdown };
  if (opts.markdownFile) {
    const p = path.isAbsolute(opts.markdownFile) ? opts.markdownFile : path.join(process.cwd(), opts.markdownFile);
    const content = fs.readFileSync(p, 'utf8');
    return { markdown_description: content };
  }
  if (opts.description != null) return { description: opts.description };
  if (opts.descriptionFile) {
    const p = path.isAbsolute(opts.descriptionFile) ? opts.descriptionFile : path.join(process.cwd(), opts.descriptionFile);
    const content = fs.readFileSync(p, 'utf8');
    return { description: content };
  }
  return {};
}

function readSubtasks(opts) {
  if (opts.subtasks && opts.subtasks.length) return opts.subtasks;
  if (opts.subtasksFile) {
    const p = path.isAbsolute(opts.subtasksFile) ? opts.subtasksFile : path.join(process.cwd(), opts.subtasksFile);
    const content = fs.readFileSync(p, 'utf8');
    return content.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

async function resolveListId(opts) {
  if (opts.listId) return opts.listId;
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

async function resolveAssigneeId(opts) {
  if (opts.assignee != null) return opts.assignee;
  const id = process.env.ASSIGNEE_USER_ID?.trim();
  if (id) {
    const n = parseInt(id, 10);
    if (!Number.isNaN(n)) return n;
  }
  const user = await getAuthorizedUser();
  if (user.id != null) return user.id;
  return null;
}

async function main() {
  const opts = parseArgs();
  if (!opts.title) {
    console.error('Uso: node scripts/create-clickup-task.cjs --title "Título" [--description "..." | --markdown-file path] [--subtasks "A,B,C" | --subtasks-file path] [--list-id id] [--assignee id] [--priority 1|2|3|4] [--status "nombre"]');
    process.exit(1);
  }

  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
    process.exit(1);
  }

  const listId = await resolveListId(opts);
  const assigneeId = await resolveAssigneeId(opts);
  const descFields = readDescription(opts);
  const subtaskTitles = readSubtasks(opts);

  console.log('Lista:', listId, assigneeId != null ? '| Asignado: ' + assigneeId : '');

  const body = {
    name: opts.title,
    ...descFields,
    ...(assigneeId != null ? { assignees: [assigneeId] } : {}),
    ...(opts.priority != null ? { priority: opts.priority } : {}),
    ...(opts.status ? { status: opts.status } : {}),
  };

  const task = await createTask(listId, body);
  console.log('Tarea creada:', task.name || opts.title);
  console.log('URL: https://app.clickup.com/t/' + task.id);

  if (subtaskTitles.length) {
    for (const name of subtaskTitles) {
      const subBody = {
        name,
        ...(assigneeId != null ? { assignees: [assigneeId] } : {}),
      };
      const sub = await createSubtask(listId, task.id, subBody);
      console.log('  Subtarea:', name, '→ https://app.clickup.com/t/' + sub.id);
    }
    console.log('Listo. Tarea +', subtaskTitles.length, 'subtareas.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
