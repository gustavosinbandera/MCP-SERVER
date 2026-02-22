/**
 * Lista work items de Azure DevOps asignados a un usuario.
 * Uso: node scripts/azure-list-user-tasks.cjs "gustavo grisales"
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { listWorkItems } = require('../dist/azure-devops-client.js');

const usuario = process.argv[2] ? process.argv[2].trim() : '';
const yearArg = process.argv[3] ? parseInt(process.argv[3], 10) : NaN;
const year = Number.isFinite(yearArg) ? yearArg : undefined;
const forMe = !usuario;

listWorkItems({ top: 50, assignedTo: usuario || undefined, assignedToMe: forMe, year })
  .then((items) => {
    const who = forMe ? 'asignados a ti (@Me)' : 'asignados a "' + usuario + '"';
    if (items.length === 0) {
      console.log('No hay work items ' + who + '.');
      return;
    }
    console.log('Work Items ' + who + ' (' + items.length + '):\n');
    items.forEach((item) => {
      const f = item.fields || {};
      const changed = f['System.ChangedDate'] ? '  ' + String(f['System.ChangedDate']).slice(0, 10) : '';
      console.log(
        '#' + item.id + ' [' + (f['System.WorkItemType'] || '?') + '] (' + (f['System.State'] || '?') + ') ' + (f['System.Title'] || '(sin título)') + changed
      );
    });
  })
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
