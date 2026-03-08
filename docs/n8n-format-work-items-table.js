/**
 * Nodo Code en n8n: formatear respuesta MCP azure_list_work_items / azure_list_work_items_by_date como tabla
 *
 * Entrada: salida del HTTP Request que llama a tools/call (azure_list_work_items o azure_list_work_items_by_date).
 * Compatible con:
 * - v2: content[0].text = summary_text + "<!--AZURE_V2-->\n" + JSON (usa data.items)
 * - legacy: content[0].text = "Work Items ...\n#ID [Type] (State) title  YYYY-MM-DD" (parsea líneas)
 *
 * Salida: mismo item + tableMarkdown, tableHtml, rows, count.
 */

const AZURE_V2_DELIMITER = '\n\n<!--AZURE_V2-->\n';

const item = $input.first();
const json = item.json;

let text = '';
try {
  const content = json.result?.content;
  if (Array.isArray(content) && content[0]?.text) {
    text = content[0].text;
  }
} catch (e) {
  return [{ json: { ...json, tableMarkdown: '', tableHtml: '', error: String(e.message) } }];
}

let rows = [];
let summaryText = text;

// v2 envelope: extraer data.items si existe
const delimIdx = text.indexOf(AZURE_V2_DELIMITER);
if (delimIdx !== -1) {
  try {
    const envelope = JSON.parse(text.slice(delimIdx + AZURE_V2_DELIMITER.length));
    if (envelope.error) {
      return [{ json: { ...json, tableMarkdown: '', tableHtml: '', rows: [], count: 0, error: envelope.error.message } }];
    }
    if (envelope.data && Array.isArray(envelope.data.items)) {
      rows = envelope.data.items.map((i) => ({
        id: String(i.id),
        type: i.type || '',
        state: i.state || '',
        title: (i.title || '').trim(),
        date: i.changed_date || i.created_date || '',
      }));
      summaryText = envelope.summary_text || text.slice(0, delimIdx);
    }
  } catch (_) {
    // fall through to legacy parsing
  }
}

// Legacy o fallback: parsear líneas "#132551 [Bug] (In Progress) título  2026-03-07"
if (rows.length === 0) {
  const lineRe = /^#(\d+)\s+\[(\w+)\]\s+\(([^)]+)\)\s+(.+?)\s+(\d{4}-\d{2}-\d{2})\s*$/;
  const lines = summaryText.split('\n').filter((l) => l.trim().startsWith('#'));
  for (const line of lines) {
    const m = line.match(lineRe);
    if (m) {
      rows.push({ id: m[1], type: m[2], state: m[3], title: m[4].trim(), date: m[5] });
    }
  }
}

// Encabezado si la primera línea es "Work Items assigned to..."
let title = 'Work Items';
const firstLine = summaryText.split('\n')[0] || '';
if (firstLine.includes('assigned to') || firstLine.includes('assigned to you')) {
  title = firstLine.replace(/^Work Items\s*/, '').trim();
}

// Tabla Markdown
const header = '| # | Tipo | Estado | Título | Fecha |\n|---|-----|--------|--------|--------|';
const mdRows = rows.map((r) => `| **${r.id}** | ${r.type} | ${r.state} | ${r.title} | ${r.date} |`);
const tableMarkdown = `## ${title}\n\n${header}\n${mdRows.join('\n')}`;

// Tabla HTML (útil para email o mensajes que acepten HTML)
const th = '<tr><th>#</th><th>Tipo</th><th>Estado</th><th>Título</th><th>Fecha</th></tr>';
const tdRows = rows.map(
  (r) =>
    `<tr><td><strong>${r.id}</strong></td><td>${r.type}</td><td>${r.state}</td><td>${r.title}</td><td>${r.date}</td></tr>`
);
const tableHtml = `<table border="1" cellpadding="6" cellspacing="0"><thead>${th}</thead><tbody>${tdRows.join('')}</tbody></table>`;

return [
  {
    json: {
      ...json,
      tableMarkdown,
      tableHtml,
      rows,
      count: rows.length,
    },
  },
];
