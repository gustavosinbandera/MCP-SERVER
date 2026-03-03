/**
 * Lista work items de Azure DevOps y busca coincidencias en los campos (Client, Network ID, etc.).
 * Usa la misma API que las tools MCP (listWorkItems + fields en cada ítem).
 *
 * Uso:
 *   node scripts/azure/search-work-items-by-field.cjs "PCS CENTRAL AMERICA"
 *   node scripts/azure/search-work-items-by-field.cjs "12345" --top 100
 *   node scripts/azure/search-work-items-by-field.cjs --assigned-to-me --field Client
 *   node scripts/azure/search-work-items-by-field.cjs --list-fields
 *
 * Opciones:
 *   <texto>              Buscar este texto en cualquier valor de fields (case-insensitive).
 *   --field <nombre>     Limitar búsqueda a un campo (ej: Client, Custom.NetworkID).
 *   --assigned-to <user> Filtrar por asignado.
 *   --assigned-to-me     Filtrar por asignado a mí.
 *   --type <tipo>        Filtrar por tipo (Bug, Task, etc.).
 *   --year <año>         Filtrar por año de ChangedDate.
 *   --top <n>            Máximo de work items a listar (default 100).
 *   --list-fields        Solo listar nombres de campos que contienen "client", "network", "ni".
 */
// .env en gateway/ (desde gateway/scripts/azure -> ../../.env)
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

let listWorkItems, getWorkItem;
try {
  const client = require('../../dist/azure/client.js');
  listWorkItems = client.listWorkItems;
  getWorkItem = client.getWorkItem;
} catch {
  const client = require('../dist/azure-devops-client.js');
  listWorkItems = client.listWorkItems;
  getWorkItem = client.getWorkItem;
}

const args = process.argv.slice(2);
const listFieldsOnly = args.includes('--list-fields');
const idxField = args.indexOf('--field');
const fieldName = idxField >= 0 && args[idxField + 1] ? args[idxField + 1].trim() : null;
const idxAssigned = args.indexOf('--assigned-to');
const assignedTo = idxAssigned >= 0 && args[idxAssigned + 1] ? args[idxAssigned + 1].trim() : null;
const assignedToMe = args.includes('--assigned-to-me');
const idxType = args.indexOf('--type');
const typeFilter = idxType >= 0 && args[idxType + 1] ? args[idxType + 1].trim() : null;
const idxYear = args.indexOf('--year');
const year = idxYear >= 0 && args[idxYear + 1] ? parseInt(args[idxYear + 1], 10) : undefined;
const idxTop = args.indexOf('--top');
const top = idxTop >= 0 && args[idxTop + 1] ? Math.min(200, Math.max(1, parseInt(args[idxTop + 1], 10))) : 100;

const optionValues = new Set(
  [fieldName, assignedTo, typeFilter, year !== undefined ? String(year) : null, idxTop >= 0 ? args[idxTop + 1] : null].filter(Boolean)
);
const searchText = args
  .filter((a) => !a.startsWith('--') && !optionValues.has(a))
  .join(' ')
  .trim();

const FIELD_HINT = /client|network|ni/i;

function findMatchingFields(fields, search, onlyField) {
  const out = [];
  const searchLower = (search || '').toLowerCase();
  for (const [key, val] of Object.entries(fields || {})) {
    if (val === null || val === undefined) continue;
    const keyMatch = !onlyField && FIELD_HINT.test(key);
    const valStr = String(val).toLowerCase();
    const exactField = onlyField && (key === onlyField || key.endsWith('.' + onlyField));
    const fieldNameMatch = onlyField && key.toLowerCase().includes(onlyField.toLowerCase()) && valStr.length > 0;
    if (exactField || fieldNameMatch) {
      out.push({ key, value: val });
    } else if (searchLower && valStr.includes(searchLower)) {
      out.push({ key, value: val });
    } else if (!searchLower && keyMatch) {
      out.push({ key, value: val });
    }
  }
  return out;
}

function run() {
  const opts = { top, assignedTo: assignedTo || undefined, assignedToMe: assignedToMe || !assignedTo, year };
  if (typeFilter) opts.type = typeFilter;

  listWorkItems(opts)
    .then((items) => {
      if (listFieldsOnly) {
        const keys = new Set();
        items.forEach((item) => {
          Object.keys(item.fields || {}).forEach((k) => {
            if (FIELD_HINT.test(k)) keys.add(k);
          });
        });
        console.log('Campos que coinciden con client/network/ni:', [...keys].sort().join(', ') || '(ninguno)');
        return;
      }

      const matches = [];
      items.forEach((item) => {
        const f = item.fields || {};
        const title = f['System.Title'] || '(sin título)';
        const state = f['System.State'] || '?';
        const witype = f['System.WorkItemType'] || '?';
        const m = findMatchingFields(f, searchText, fieldName);
        if (m.length) matches.push({ id: item.id, title, state, type: witype, fields: m });
      });

      if (searchText) {
        console.log('Búsqueda: "' + searchText + '" en ' + (fieldName ? 'campo "' + fieldName + '"' : 'todos los campos') + '\n');
      } else if (fieldName) {
        console.log('Campo: "' + fieldName + '"\n');
      } else {
        console.log('Mostrando ítems con campos tipo Client/Network/NI:\n');
      }

      if (matches.length === 0) {
        console.log('No se encontraron coincidencias en ' + items.length + ' work items.');
        return;
      }

      console.log(matches.length + ' work item(s) con coincidencia(s):\n');
      matches.forEach(({ id, title, state, type, fields }) => {
        console.log('#' + id + ' [' + type + '] (' + state + ') ' + title);
        fields.forEach(({ key, value }) => console.log('    ' + key + ': ' + value));
        console.log('');
      });
    })
    .catch((err) => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

run();
