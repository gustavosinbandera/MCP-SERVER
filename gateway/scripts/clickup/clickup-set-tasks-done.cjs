/**
 * One-off: get list statuses and set given tasks to "done" (or last status in list).
 * Usage: node gateway/scripts/clickup-set-tasks-done.cjs
 * Env: CLICKUP_API_TOKEN in gateway/.env (or parent .env).
 */
const path = require('path');
const fs = require('fs');

// Load gateway/.env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const LIST_ID = '901325668563';
const TASK_IDS = ['86afu5698', '86afu575b'];
const BASE = 'https://api.clickup.com/api/v2';
const token = process.env.CLICKUP_API_TOKEN?.trim();
if (!token) {
  console.error('CLICKUP_API_TOKEN not set');
  process.exit(1);
}

const headers = { Authorization: token, 'Content-Type': 'application/json' };

async function getList() {
  const res = await fetch(`${BASE}/list/${LIST_ID}`, { headers });
  if (!res.ok) throw new Error(`List: ${res.status} ${await res.text()}`);
  return res.json();
}

async function updateTask(taskId, body) {
  const res = await fetch(`${BASE}/task/${taskId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Update ${taskId}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const list = await getList();
  const statuses = list.statuses || list.status || [];
  const names = Array.isArray(statuses)
    ? statuses.map((s) => (typeof s === 'string' ? s : s.status || s.name)).filter(Boolean)
    : [];

  console.log('List statuses:', names.length ? names : '(none found in list response)');

  // Prefer: done, complete, closed, hecho, listo, completo, finalizado (any case)
  const doneLike = [
    'done',
    'complete',
    'closed',
    'hecho',
    'listo',
    'completo',
    'finalizado',
    'Done',
    'Complete',
    'Closed',
    'DONE',
  ];
  let chosen = names.find((n) => doneLike.includes(n));
  if (!chosen && names.length > 0) {
    // Use last status (often "done" is last)
    chosen = names[names.length - 1];
    console.log('Using last status:', chosen);
  }
  if (!chosen) {
    console.error('Could not determine status. Try setting status manually in ClickUp.');
    process.exit(1);
  }

  console.log('Setting status to:', chosen);
  for (const taskId of TASK_IDS) {
    await updateTask(taskId, { status: chosen });
    console.log('Updated task', taskId);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
