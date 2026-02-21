/**
 * Script genérico para añadir subtareas a una tarea existente en ClickUp.
 * Requiere CLICKUP_API_TOKEN en gateway/.env
 *
 * Uso (desde gateway/):
 *   node scripts/create-clickup-subtask.cjs --parent-id <task_id> --title "Nombre de la subtarea"
 *   node scripts/create-clickup-subtask.cjs --parent-id <task_id> --titles "A,B,C"
 *   node scripts/create-clickup-subtask.cjs --parent-id <task_id> --titles-file path.txt
 *
 * Opciones:
 *   --parent-id id   (requerido) ID de la tarea padre (ej. 86afm198y)
 *   --list-id id     (requerido si la lista no está en LIST_ID en .env) Lista donde está la tarea padre
 *   --title "..."    Una sola subtarea
 *   --titles "A,B,C" Varias subtareas separadas por comas
 *   --titles-file p  Una subtarea por línea
 *   --assignee id    User ID asignado (si no, ASSIGNEE_USER_ID o usuario autorizado)
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const {
  getTask,
  getTeams,
  getSpaces,
  getFolders,
  getLists,
  createSubtask,
  getAuthorizedUser,
  hasClickUpToken,
} = require('../dist/clickup-client.js');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    parentId: null,
    listId: null,
    title: null,
    titles: null,
    titlesFile: null,
    assignee: null,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[i + 1];
    if (a === '--parent-id' && next()) {
      out.parentId = next().trim();
      i++;
    } else if (a === '--list-id' && next()) {
      out.listId = next().trim();
      i++;
    } else if (a === '--title' && next()) {
      out.title = next();
      i++;
    } else if (a === '--titles' && next()) {
      out.titles = next().split(',').map((s) => s.trim()).filter(Boolean);
      i++;
    } else if (a === '--titles-file' && next()) {
      out.titlesFile = next();
      i++;
    } else if (a === '--assignee' && next()) {
      const n = parseInt(next(), 10);
      if (!Number.isNaN(n)) out.assignee = n;
      i++;
    }
  }
  return out;
}

function getSubtaskTitles(opts) {
  if (opts.title) return [opts.title];
  if (opts.titles && opts.titles.length) return opts.titles;
  if (opts.titlesFile) {
    const p = path.isAbsolute(opts.titlesFile) ? opts.titlesFile : path.join(process.cwd(), opts.titlesFile);
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
  const titles = getSubtaskTitles(opts);

  if (!opts.parentId) {
    console.error('Uso: node scripts/create-clickup-subtask.cjs --parent-id <task_id> (--title "..." | --titles "A,B,C" | --titles-file path) [--list-id id]');
    process.exit(1);
  }
  if (!titles.length) {
    console.error('Indica al menos una subtarea: --title "..." o --titles "A,B,C" o --titles-file path');
    process.exit(1);
  }

  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
    process.exit(1);
  }

  const listId = await resolveListId(opts);
  const assigneeId = await resolveAssigneeId(opts);

  // Verificar que la tarea padre existe (la API de subtareas requiere list_id de la misma lista)
  await getTask(opts.parentId);

  for (const name of titles) {
    const body = {
      name,
      ...(assigneeId != null ? { assignees: [assigneeId] } : {}),
    };
    const sub = await createSubtask(listId, opts.parentId, body);
    console.log('Subtarea creada:', name, '→ https://app.clickup.com/t/' + sub.id);
  }
  console.log('Listo.', titles.length, titles.length === 1 ? 'subtarea.' : 'subtareas.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
