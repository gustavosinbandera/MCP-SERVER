/**
 * Bug supervisor: fetches ClickUp list, filters BUG-* tasks, detects already-processed ones,
 * searches for relevant code, generates a solution with an LLM, and updates the task.
 * See gateway/docs/SUPERVISOR-BUGS.md and agent plan agente_supervisor_bugs_clickup.
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
// Legacy Spanish header retained only for backwards compatibility with existing task descriptions.
const LEGACY_SOLUTION_SECTION_HEADERS = ['## Soluci\u00f3n sugerida', '## Solucion sugerida'] as const;
const SOLUTION_SECTION_HEADER = '## Suggested solution';

/** Resolve listId: LIST_ID in .env, or discover it (workspace MCP-SERVER → space → folder → list). */
export async function resolveBugListId(): Promise<string> {
  const listId = process.env.LIST_ID?.trim();
  if (listId) return listId;
  const teams = await getTeams();
  if (!teams.length) throw new Error('No workspaces found.');
  const team = teams.find((t) => t.name && t.name.includes('MCP-SERVER')) || teams[0];
  const spaces = await getSpaces(String(team.id));
  if (!spaces.length) throw new Error('No spaces found.');
  const folders = await getFolders(spaces[0].id);
  if (!folders.length) throw new Error('No folders found.');
  const lists = await getLists(folders[0].id);
  if (!lists.length) throw new Error('No lists found.');
  return lists[0].id;
}

/** Return tasks in the list whose title starts with BUG-. */
export async function getBugTasks(listId: string): Promise<ClickUpTask[]> {
  const tasks = await getTasks(listId);
  return tasks.filter((t) => (t.name || '').startsWith(BUG_PREFIX));
}

/** True if the task description already contains the suggested-solution section (already processed). */
export function isAlreadyProcessed(task: ClickUpTask): boolean {
  const desc = typeof task.description === 'string' ? task.description : '';
  return desc.includes(SOLUTION_SECTION_HEADER) || LEGACY_SOLUTION_SECTION_HEADERS.some((h) => desc.includes(h));
}

export { findRelevantCode } from './bug-search-code';
export type { CodeSnippet } from './bug-search-code';
export { generateSolutionMarkdown, hasOpenAIForBugs } from './bug-solution-llm';
export { getTask, updateTask, hasClickUpToken };

/** Constant used when writing the section in the description. */
export const SOLUTION_HEADER = SOLUTION_SECTION_HEADER;

/**
 * Build the updated description: existing description + "Suggested solution" section + generated text.
 * If the section already exists (English or Spanish), replace it with the new content.
 */
export function buildDescriptionWithSolution(
  currentDescription: string | undefined,
  solutionMarkdown: string
): string {
  const current = (currentDescription || '').trim();
  const header = SOLUTION_SECTION_HEADER;
  const indices = [
    current.indexOf(SOLUTION_SECTION_HEADER),
    ...LEGACY_SOLUTION_SECTION_HEADERS.map((h) => current.indexOf(h)),
  ].filter((i) => i >= 0);
  const idx = indices.length > 0 ? Math.min(...indices) : -1;
  const base = idx >= 0 ? current.slice(0, idx).trim() : current;
  const newSection = `${header}\n\n${solutionMarkdown.trim()}`;
  return base ? `${base}\n\n${newSection}` : newSection;
}
