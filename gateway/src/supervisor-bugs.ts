/**
 * Supervisor de bugs: obtiene lista ClickUp, filtra tareas BUG-*, detecta ya procesadas,
 * búsqueda de código relevante, generación de solución con LLM y actualización de tarea.
 * Ver gateway/docs/SUPERVISOR-BUGS.md y plan agente_supervisor_bugs_clickup.
 */

import type { ClickUpTask } from './clickup-client';
import {
  getTeams,
  getSpaces,
  getFolders,
  getLists,
  getTasks,
  getTask,
  updateTask,
  hasClickUpToken,
} from './clickup-client';

const BUG_PREFIX = 'BUG-';
const SOLUTION_SECTION_HEADER = '## Solución sugerida';

/** Resuelve listId: LIST_ID en .env o descubrimiento (workspace MCP-SERVER → space → folder → list). */
export async function resolveBugListId(): Promise<string> {
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

/** Devuelve tareas de la lista cuyo título empiece por BUG-. */
export async function getBugTasks(listId: string): Promise<ClickUpTask[]> {
  const tasks = await getTasks(listId);
  return tasks.filter((t) => (t.name || '').startsWith(BUG_PREFIX));
}

/** True si la descripción de la tarea ya contiene la sección "Solución sugerida" (ya procesada). */
export function isAlreadyProcessed(task: ClickUpTask): boolean {
  const desc = typeof task.description === 'string' ? task.description : '';
  return desc.includes(SOLUTION_SECTION_HEADER);
}

export { findRelevantCode } from './bug-search-code';
export type { CodeSnippet } from './bug-search-code';
export { generateSolutionMarkdown, hasOpenAIForBugs } from './bug-solution-llm';
export { getTask, updateTask, hasClickUpToken };

/** Constante para añadir la sección en la descripción. */
export const SOLUTION_HEADER = SOLUTION_SECTION_HEADER;

/**
 * Construye la descripción actualizada: descripción existente + sección "Solución sugerida" + texto generado.
 * Si ya existe la sección, la reemplaza por el nuevo contenido.
 */
export function buildDescriptionWithSolution(
  currentDescription: string | undefined,
  solutionMarkdown: string
): string {
  const current = (currentDescription || '').trim();
  const header = SOLUTION_SECTION_HEADER;
  const idx = current.indexOf(header);
  const base = idx >= 0 ? current.slice(0, idx).trim() : current;
  const newSection = `${header}\n\n${solutionMarkdown.trim()}`;
  return base ? `${base}\n\n${newSection}` : newSection;
}
