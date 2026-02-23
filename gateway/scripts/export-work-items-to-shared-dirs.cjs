/**
 * Exporta MUCHOS work items (solo desarrollo del Blue Ivory Team) a markdown y los guarda
 * en carpetas persistentes para indexación (classic/ y blueivory/).
 *
 * Requiere: AZURE_DEVOPS_BASE_URL, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT en gateway/.env (o .env en la raíz en Docker).
 *
 * Destino:
 *   - {projectRoot}/classic/work-items/work-item-{id}.md
 *   - {projectRoot}/blueivory/work-items/work-item-{id}.md
 *
 * Dedupe / costos:
 *   - Por defecto NO sobrescribe si el archivo ya existe (evita divergencias y costos de reindex).
 *   - Usa --overwrite para sobrescribir.
 *
 * Uso:
 *   node scripts/export-work-items-to-shared-dirs.cjs --top 50 --type Bug
 *   node scripts/export-work-items-to-shared-dirs.cjs --ids 130704,126783
 *   node scripts/export-work-items-to-shared-dirs.cjs --assigned-to "Gustavo Grisales" --year 2026 --type Bug
 */
const path = require('path');
const fs = require('fs');
const pLimit = require('p-limit');

// En Docker (compose) el .env está en la raíz del repo; en local existe gateway/.env.
// Cargamos ambos; si no existen no falla.
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: false });
} catch {}
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), override: false });
} catch {}

const {
  getWorkItemWithRelations,
  extractChangesetIds,
  getChangeset,
  getChangesetChanges,
  getChangesetFileDiff,
  pickAuthor,
  listWorkItems,
} = require('../dist/azure-devops-client.js');

function parseList(str) {
  return String(str || '')
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    ids: [],
    top: 50,
    type: '',
    year: undefined,
    assignedTo: undefined,
    overwrite: false,
    areaPath: undefined,
    areaPathUnder: true,
    statesExclude: undefined,
    concurrency: 2,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--ids') out.ids = parseList(args[++i]);
    else if (a === '--top') out.top = parseInt(args[++i], 10);
    else if (a === '--type') out.type = String(args[++i] || '');
    else if (a === '--year') out.year = parseInt(args[++i], 10);
    else if (a === '--assigned-to') out.assignedTo = String(args[++i] || '').trim() || undefined;
    else if (a === '--overwrite') out.overwrite = true;
    else if (a === '--area-path') out.areaPath = String(args[++i] || '').trim() || undefined;
    else if (a === '--area-exact') out.areaPathUnder = false;
    else if (a === '--states-exclude') out.statesExclude = parseList(args[++i]);
    else if (a === '--concurrency') out.concurrency = Math.max(1, Math.min(10, parseInt(args[++i], 10) || 2));
  }
  return out;
}

async function fetchWorkItemWithChangesets(workItemId) {
  const wi = await getWorkItemWithRelations(workItemId);
  const f = wi.fields || {};
  const title = f['System.Title'] ?? '(sin título)';
  const type = f['System.WorkItemType'] ?? '?';
  const state = f['System.State'] ?? '?';
  const assignedTo = f['System.AssignedTo'];
  const assignedName =
    typeof assignedTo === 'object' && assignedTo?.displayName ? assignedTo.displayName : assignedTo ?? '';
  const createdDate = f['System.CreatedDate'] ?? '';
  const changedDate = f['System.ChangedDate'] ?? '';
  const areaPath = f['System.AreaPath'] ?? '';
  const iterationPath = f['System.IterationPath'] ?? '';
  const description = f['System.Description'] ?? '';

  const csIds = extractChangesetIds(wi);
  const changesets = [];
  const allFiles = new Set();

  for (const csId of csIds) {
    const cs = await getChangeset(csId);
    const author = pickAuthor(cs);
    const comment = (cs.comment || '').trim();
    const date = cs.createdDate || cs.checkinDate || '';
    const ch = await getChangesetChanges(csId);
    const items = ch.value || [];
    const files = [];
    for (const it of items) {
      const p = it.item?.path || it.item?.serverItem || '';
      if (!p) continue;
      allFiles.add(p);
      let diffText = null;
      let diffMeta = '';
      try {
        const { diff, prevCs, currentCs, isNewFile } = await getChangesetFileDiff(p, csId);
        const diffLines = diff.map((op) => (op.t === '...' ? '...' : op.t + ' ' + op.s));
        diffMeta = isNewFile ? '(archivo nuevo)' : `(${prevCs} → ${currentCs})`;
        diffText = diffLines.join('\n');
      } catch (e) {
        diffMeta = '(error al obtener diff)';
        diffText = e && e.message ? e.message : String(e);
      }
      files.push({ path: p, changeType: it.changeType ?? '?', diff: diffText, diffMeta });
    }
    changesets.push({ csId, author, date, comment, files });
  }

  return {
    id: workItemId,
    title,
    type,
    state,
    assignedTo: assignedName,
    createdDate: String(createdDate).slice(0, 19),
    changedDate: String(changedDate).slice(0, 19),
    areaPath,
    iterationPath,
    description: String(description).trim(),
    changesets,
    allFiles: Array.from(allFiles),
  };
}

function buildMarkdown(data) {
  const lines = [
    '---',
    `work_item_id: ${data.id}`,
    `work_item_type: ${data.type}`,
    `state: ${data.state}`,
    `assigned_to: "${String(data.assignedTo || '').replace(/"/g, '\\"')}"`,
    `created: ${data.createdDate}`,
    `changed: ${data.changedDate}`,
    `area_path: ${data.areaPath}`,
    `changeset_ids: [${data.changesets.map((c) => c.csId).join(', ')}]`,
    `file_paths: [${data.allFiles.map((p) => `"${String(p).replace(/"/g, '\\"')}"`).join(', ')}]`,
    '---',
    '',
    `# ${data.type} #${data.id}: ${data.title}`,
    '',
    `**Estado:** ${data.state} | **Asignado:** ${data.assignedTo || '?'} | **Creado:** ${data.createdDate} | **Modificado:** ${data.changedDate}`,
    `**Área:** ${data.areaPath}`,
    '',
    '## Descripción',
    '',
    data.description || '(sin descripción)',
    '',
    '## Changesets vinculados',
    '',
  ];

  for (const cs of data.changesets) {
    lines.push(`### Changeset ${cs.csId} — ${cs.author} — ${cs.date}`);
    lines.push('');
    lines.push(cs.comment || '(sin comentario)');
    lines.push('');
    lines.push('**Archivos:**');
    for (const { path: fp, changeType } of cs.files) {
      lines.push(`- [${changeType}] \`${fp}\``);
    }
    for (const { path: fp, diff, diffMeta } of cs.files) {
      if (diff != null) {
        const fileName = String(fp).split('/').pop() || fp;
        lines.push('');
        lines.push(`**Diff** \`${fileName}\` ${diffMeta}:`);
        lines.push('');
        lines.push('```diff');
        lines.push(diff);
        lines.push('```');
        lines.push('');
      }
    }
  }

  lines.push('## Resumen de archivos editados');
  lines.push('');
  for (const fp of data.allFiles) lines.push(`- \`${fp}\``);
  return lines.join('\n');
}

function resolveProjectFromTitleOrPaths(title, filePaths) {
  const t = String(title || '').toLowerCase();
  if (t.includes('[classic]') || t.includes('[core/') || t.includes('[core]') || t.includes('[core')) return 'classic';
  if (t.includes('[bi]') || t.includes('[blue ivory') || t.includes('[blueivory')) return 'blueivory';

  const upper = (Array.isArray(filePaths) ? filePaths : []).map((p) => String(p)).join(' ').toUpperCase();
  if (upper.includes('BLUE-IVORY')) return 'blueivory';
  if (upper.includes('MAIN-BRANCHES/CORE') || upper.includes('/CORE/') || upper.includes('\\CORE\\')) return 'classic';

  return 'blueivory';
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const args = parseArgs();

  const defaultArea = process.env.AZURE_DEVOPS_WORK_ITEMS_AREA_PATH || 'Magaya Core Project\\Blue Ivory Team';
  const defaultStatesExclude = parseList(process.env.AZURE_DEVOPS_WORK_ITEMS_STATES_EXCLUDE || 'Ready to Test;BETA Retest');

  const areaPath = args.areaPath != null ? args.areaPath : defaultArea;
  const statesExclude = args.statesExclude != null ? args.statesExclude : defaultStatesExclude;

  let ids = [];
  if (args.ids && args.ids.length > 0) {
    ids = args.ids.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n));
  } else {
    const items = await listWorkItems({
      type: args.type || undefined,
      top: Number.isFinite(args.top) ? args.top : 50,
      assignedToMe: !args.assignedTo,
      assignedTo: args.assignedTo,
      year: args.year,
      areaPath,
      areaPathUnder: args.areaPathUnder,
      statesExclude,
    });
    ids = items.map((it) => it.id).filter((n) => Number.isFinite(n));
  }

  if (!ids.length) {
    console.log('No hay work items con los filtros actuales.');
    return;
  }

  const projectRoot = path.resolve(__dirname, '..', '..'); // parent de gateway/
  const limit = pLimit(args.concurrency || 2);

  console.log('Exportando', ids.length, 'work item(s)...');
  console.log('  - Area:', areaPath, args.areaPathUnder ? '(UNDER)' : '(=)');
  console.log('  - Excluyendo estados:', statesExclude.join(', ') || '(ninguno)');
  console.log('  - Overwrite:', args.overwrite ? 'true' : 'false');
  console.log('  - Concurrency:', args.concurrency);
  console.log('  - Destino root:', projectRoot);

  const results = await Promise.all(
    ids.map((id) =>
      limit(async () => {
        try {
          const data = await fetchWorkItemWithChangesets(id);
          const project = resolveProjectFromTitleOrPaths(data.title, data.allFiles);
          const outDir = path.join(projectRoot, project, 'work-items');
          ensureDir(outDir);
          const outPath = path.join(outDir, `work-item-${id}.md`);
          if (fs.existsSync(outPath) && !args.overwrite) {
            return { id, project, outPath, status: 'skipped_exists', changesets: data.changesets.length, files: data.allFiles.length };
          }
          const md = buildMarkdown(data);
          fs.writeFileSync(outPath, md, 'utf8');
          return { id, project, outPath, status: 'written', changesets: data.changesets.length, files: data.allFiles.length };
        } catch (e) {
          return { id, project: '?', outPath: '', status: 'error', error: e && e.message ? e.message : String(e) };
        }
      })
    )
  );

  const counts = results.reduce(
    (acc, r) => {
      acc.total++;
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    { total: 0 }
  );

  console.log('Resumen:', counts);
  results
    .filter((r) => r.status === 'written' || r.status === 'skipped_exists' || r.status === 'error')
    .slice(0, 20)
    .forEach((r) => {
      if (r.status === 'error') console.log(`  - #${r.id} ERROR: ${r.error}`);
      else console.log(`  - #${r.id} ${r.status} -> ${r.project} (${r.changesets} changesets, ${r.files} archivos): ${r.outPath}`);
    });
  if (results.length > 20) console.log('  (mostrando solo 20 items)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

