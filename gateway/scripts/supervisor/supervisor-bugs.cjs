/**
 * Orquestador del supervisor de bugs: lista tareas BUG-*, para cada una no procesada
 * busca código relevante, genera solución con LLM y actualiza la descripción en ClickUp.
 * Uso: node scripts/supervisor-bugs.cjs [--all]
 *   --all: procesar también tareas que ya tienen "Solución sugerida" (reemplazar).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const {
  resolveBugListId,
  getBugTasks,
  getTask,
  updateTask,
  isAlreadyProcessed,
  findRelevantCode,
  generateSolutionMarkdown,
  buildDescriptionWithSolution,
  hasClickUpToken,
  hasOpenAIForBugs,
} = require('../dist/supervisor-bugs.js');

const processAll = process.argv.includes('--all');

async function main() {
  if (!hasClickUpToken()) {
    console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
    process.exit(1);
  }
  if (!hasOpenAIForBugs()) {
    console.error('OPENAI_API_KEY no está definido. Necesario para generar soluciones.');
    process.exit(1);
  }

  const listId = await resolveBugListId();
  console.log('Lista:', listId);

  const bugs = await getBugTasks(listId);
  console.log('Tareas BUG-*:', bugs.length);

  for (const task of bugs) {
    if (!processAll && isAlreadyProcessed(task)) {
      console.log('Omitida (ya procesada):', task.name);
      continue;
    }
    console.log('Procesando:', task.name);
    const full = await getTask(task.id);
    const title = full.name || task.name || '';
    const currentDesc = typeof full.description === 'string' ? full.description : '';

    const snippets = findRelevantCode(title, currentDesc);
    console.log('  Fragmentos de código:', snippets.length);

    const solutionMarkdown = await generateSolutionMarkdown(title, currentDesc, snippets);
    const newDescription = buildDescriptionWithSolution(currentDesc, solutionMarkdown);

    await updateTask(task.id, { markdown_description: newDescription });
    console.log('  Actualizada:', task.id);
  }

  console.log('Listo.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
