/**
 * Exporta UN work item de Azure DevOps a markdown: detalle, changesets y archivos editados.
 * Uso:
 *   node scripts/export-work-item-to-md.cjs --work-item-id 132834
 *   node scripts/export-work-item-to-md.cjs -w 54678
 * Si no se pasa ID, intenta obtener el primer Task disponible (sin filtro de asignado).
 *
 * Requiere: AZURE_DEVOPS_BASE_URL, AZURE_DEVOPS_PROJECT, AZURE_DEVOPS_PAT en gateway/.env
 * Salida: gateway/tmp/work-item-{id}.md
 */
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const {
  getWorkItemWithRelations,
  extractChangesetIds,
  getChangeset,
  getChangesetChanges,
  getChangesetFileDiff,
  pickAuthor,
  listWorkItems,
} = require('../dist/azure-devops-client.js');

function parseArgs() {
  const args = process.argv.slice(2);
  let workItemId = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--work-item-id' || args[i] === '-w') {
      workItemId = parseInt(args[i + 1], 10);
      break;
    }
  }
  return workItemId;
}

async function fetchWorkItemWithChangesets(workItemId) {
  const wi = await getWorkItemWithRelations(workItemId);
  const f = wi.fields || {};
  const title = f['System.Title'] ?? '(sin título)';
  const type = f['System.WorkItemType'] ?? '?';
  const state = f['System.State'] ?? '?';
  const assignedTo = f['System.AssignedTo'];
  const assignedName = typeof assignedTo === 'object' && assignedTo?.displayName
    ? assignedTo.displayName
    : (assignedTo ?? '');
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
        diffText = e.message;
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
    `assigned_to: "${(data.assignedTo || '').replace(/"/g, '\\"')}"`,
    `created: ${data.createdDate}`,
    `changed: ${data.changedDate}`,
    `area_path: ${data.areaPath}`,
    `changeset_ids: [${data.changesets.map((c) => c.csId).join(', ')}]`,
    `file_paths: [${data.allFiles.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(', ')}]`,
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
        const fileName = fp.split('/').pop() || fp;
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
  for (const fp of data.allFiles) {
    lines.push(`- \`${fp}\``);
  }

  return lines.join('\n');
}

async function main() {
  let workItemId = parseArgs();
  if (!workItemId || !Number.isFinite(workItemId)) {
    console.log('No se proporcionó --work-item-id. Obteniendo el primer Task disponible...');
    const items = await listWorkItems({
      type: 'Task',
      top: 1,
      assignedToMe: false,
      assignedTo: undefined,
    });
    if (!items.length) {
      console.error('No hay Tasks en Azure DevOps con los filtros actuales.');
      process.exit(1);
    }
    workItemId = items[0].id;
    console.log('Usando Task #' + workItemId);
  }

  console.log('Obteniendo work item #' + workItemId + '...');
  const data = await fetchWorkItemWithChangesets(workItemId);
  const md = buildMarkdown(data);

  const tmpDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  const outPath = path.join(tmpDir, `work-item-${workItemId}.md`);
  fs.writeFileSync(outPath, md, 'utf8');
  console.log('Escrito:', outPath);
  console.log('  - Changesets:', data.changesets.length);
  console.log('  - Archivos:', data.allFiles.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
