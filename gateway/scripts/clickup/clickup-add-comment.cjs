/**
 * Añade un comentario a una tarea ClickUp.
 * Uso: desde gateway/ → node scripts/clickup-add-comment.cjs --task-id 86afmer8g --text "Comentario"
 * Requiere CLICKUP_API_TOKEN en .env
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), override: true });

const taskId = process.argv.find((a, i) => process.argv[i - 1] === '--task-id') || process.env.CLICKUP_COMMENT_TASK_ID;
const text = process.argv.find((a, i) => process.argv[i - 1] === '--text') || process.env.CLICKUP_COMMENT_TEXT;

if (!taskId || !text) {
  console.error('Uso: node scripts/clickup-add-comment.cjs --task-id <task_id> --text "<comentario>"');
  process.exit(1);
}

const token = process.env.CLICKUP_API_TOKEN?.trim();
if (!token) {
  console.error('CLICKUP_API_TOKEN no está definido en gateway/.env');
  process.exit(1);
}

async function main() {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/comment`, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ comment_text: text, notify_all: false }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error('ClickUp API', res.status, body);
    process.exit(1);
  }
  console.log('Comentario añadido a la tarea', taskId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
