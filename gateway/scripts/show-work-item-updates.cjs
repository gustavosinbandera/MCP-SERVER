/**
 * Muestra el historial de actualizaciones (logs) de un work item de Azure DevOps.
 * Uso: node scripts/show-work-item-updates.cjs 133093
 */
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}
try { require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') }); } catch {}

const { getWorkItemUpdates } = require('../dist/azure-devops-client.js');

const id = parseInt(process.argv[2], 10) || 133093;

async function main() {
  const { value: updates } = await getWorkItemUpdates(id, 50);
  if (!updates || updates.length === 0) {
    console.log(`Work item #${id}: sin historial de actualizaciones.`);
    return;
  }
  console.log(`# Historial de actualizaciones - Work Item #${id}\n`);
  for (const u of updates) {
    const by = (u.revisedBy && typeof u.revisedBy === 'object' && u.revisedBy.displayName) || '?';
    const date = u.revisedDate ? String(u.revisedDate).slice(0, 19) : '?';
    console.log(`## Rev ${u.rev ?? '?'} — ${by} — ${date}`);
    if (u.fields && Object.keys(u.fields).length > 0) {
      for (const [field, change] of Object.entries(u.fields)) {
        const oldV = change?.oldValue;
        const newV = change?.newValue;
        const short = (v) => (v == null ? '(vacío)' : String(v).length > 80 ? String(v).slice(0, 77) + '...' : String(v));
        console.log(`  - ${field}: ${short(oldV)} → ${short(newV)}`);
      }
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
