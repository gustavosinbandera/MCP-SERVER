/**
 * Actualiza una tarea SB por nombre: status y/o markdown_description.
 * Uso: node scripts/update-sb-task-status.cjs "SB-1 Lista ClickUp..." "completado" "markdown content..."
 * O: node scripts/update-sb-task-status.cjs "SB-1 Lista ClickUp..." "en curso"
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });
const { getTeams, getSpaces, getFolders, getLists, getList, getTasks, getTask, updateTask, hasClickUpToken } = require('../dist/clickup-client.js');

const fs = require('fs');
const taskNamePrefix = process.argv[2]; // e.g. "SB-1" or "SB-1 Lista"
const newStatus = process.argv[3];      // "en curso" | "completado"
let markdown = process.argv[4];        // optional: markdown string or path to .md file
if (markdown && fs.existsSync(markdown)) markdown = fs.readFileSync(markdown, 'utf8');

async function resolveListId() {
  const listId = process.env.LIST_ID?.trim();
  if (listId) return listId;
  const teams = await getTeams();
  if (!teams.length) throw new Error('No hay workspaces.');
  const team = teams.find((t) => t.name && t.name.includes('MCP-SERVER')) || teams[0];
  const spaces = await getSpaces(String(team.id));
  const folders = await getFolders(spaces[0].id);
  const lists = await getLists(folders[0].id);
  return lists[0].id;
}

async function main() {
  if (!hasClickUpToken() || !taskNamePrefix || !newStatus) {
    console.error('Uso: node update-sb-task-status.cjs "SB-1 Lista..." "completado" ["markdown"]');
    process.exit(1);
  }
  const listId = await resolveListId();
  const tasks = await getTasks(listId);
  const task = tasks.find((t) => (t.name || '').startsWith(taskNamePrefix) || (t.name || '').includes(taskNamePrefix));
  if (!task) {
    console.error('Tarea no encontrada:', taskNamePrefix);
    process.exit(1);
  }
  const body = { status: newStatus };
  if (markdown) body.markdown_description = markdown;
  await updateTask(task.id, body);
  console.log('Actualizada:', task.name, '->', newStatus);
}

main().catch((e) => { console.error(e); process.exit(1); });
