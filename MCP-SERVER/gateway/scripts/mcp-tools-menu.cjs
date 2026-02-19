/**
 * Menú de consola: listar herramientas MCP y mostrar documentación.
 * Uso:
 *   node scripts/mcp-tools-menu.cjs                    → menú interactivo
 *   node scripts/mcp-tools-menu.cjs search_docs --help  → muestra docs/tools/search_docs.md
 * Ejecutar desde gateway: node scripts/mcp-tools-menu.cjs
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ANSI colors (compatible con Windows 10+ y terminales Unix)
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
};
function cyan(s) { return c.cyan + s + c.reset; }
function green(s) { return c.green + s + c.reset; }
function yellow(s) { return c.yellow + s + c.reset; }
function dim(s) { return c.dim + s + c.reset; }
function bold(s) { return c.bold + s + c.reset; }
function gray(s) { return c.gray + s + c.reset; }
function red(s) { return c.red + s + c.reset; }

const TOOLS_DIR = path.join(__dirname, '..', 'docs', 'tools');
let TOOL_LIST;
try {
  TOOL_LIST = require('./tools-config.cjs');
} catch (_) {
  TOOL_LIST = [
    'search_docs', 'count_docs', 'analize_code', 'index_url', 'index_url_with_links',
    'index_site', 'write_flow_doc', 'list_shared_dir', 'read_shared_file',
  ].map((name) => ({ name, aliases: [], keywords: [] }));
}
if (!Array.isArray(TOOL_LIST) || TOOL_LIST.some((t) => !t.name)) {
  TOOL_LIST = TOOL_LIST.map((t) => (typeof t === 'string' ? { name: t, aliases: [], keywords: [] } : t));
}
const TOOL_NAMES = TOOL_LIST.map((t) => (typeof t === 'string' ? t : t.name));

/** Resuelve alias o nombre a nombre exacto de tool, o null. */
function resolveToToolName(input) {
  const clean = String(input).trim().replace(/\s*--help\s*$/i, '').toLowerCase();
  if (!clean) return null;
  for (let i = 0; i < TOOL_LIST.length; i++) {
    const t = TOOL_LIST[i];
    const name = typeof t === 'string' ? t : t.name;
    if (name.toLowerCase() === clean) return name;
    const aliases = (t.aliases || []).map((a) => a.toLowerCase());
    if (aliases.includes(clean)) return name;
  }
  return null;
}

/** Busca tools cuyos keywords o nombre/alias contengan la frase (sugerencia inteligente). Devuelve [{ index, name }]. */
function suggestToolsByPhrase(input) {
  const clean = String(input).trim().toLowerCase();
  if (clean.length < 2) return [];
  const out = [];
  for (let i = 0; i < TOOL_LIST.length; i++) {
    const t = TOOL_LIST[i];
    const name = typeof t === 'string' ? t : t.name;
    const aliases = (t.aliases || []).map((a) => a.toLowerCase());
    const keywords = (t.keywords || []).map((k) => k.toLowerCase());
    const all = [name, ...aliases, ...keywords];
    const match = all.some((s) => s.includes(clean) || clean.includes(s));
    if (match) out.push({ index: i, name });
  }
  return out;
}

function getDocPath(name) {
  const exact = TOOL_NAMES.find((t) => t.toLowerCase() === String(name).toLowerCase());
  const base = exact || resolveToToolName(name) || String(name).trim();
  const p = path.join(TOOLS_DIR, `${base}.md`);
  return p;
}

function readDoc(name) {
  const docPath = getDocPath(name);
  if (!docPath) return null;
  try {
    if (fs.existsSync(docPath)) return fs.readFileSync(docPath, 'utf-8');
  } catch (_) {}
  return null;
}

function showDoc(name) {
  const content = readDoc(name);
  if (content) {
    const w = 62;
    const title = name.length > w - 4 ? name.slice(0, w - 7) + '...' : name;
    console.log('\n' + dim('┌' + '─'.repeat(w) + '┐'));
    console.log(dim('│ ') + bold(cyan(title)) + dim(' '.repeat(Math.max(0, w - 2 - title.length)) + ' │'));
    console.log(dim('└' + '─'.repeat(w) + '┘'));
    // Títulos ## en cyan, # en bold+cyan
    const styled = content
      .replace(/^### (.+)$/gm, (_, t) => cyan('  ' + t))
      .replace(/^## (.+)$/gm, (_, t) => bold(cyan('## ' + t)))
      .replace(/^# (.+)$/gm, (_, t) => bold(cyan('# ' + t)));
    console.log(styled);
    console.log(dim('─'.repeat(64)) + '\n');
    return true;
  }
  console.log('\n' + red('No se encontró documentación para "' + name + '".') + ' Herramientas: ' + TOOL_NAMES.join(', ') + '\n');
  return false;
}

function showMenu() {
  console.log('');
  console.log(bold(cyan('  ╭──────────────────────────────────────────────────────────╮')));
  console.log(bold(cyan('  │  MCP Knowledge Hub — Herramientas y documentación       │')));
  console.log(bold(cyan('  ╰──────────────────────────────────────────────────────────╯')));
  console.log('');
  TOOL_LIST.forEach((t, i) => {
    const name = typeof t === 'string' ? t : t.name;
    const aliases = (t.aliases || []).slice(0, 3).join(', ');
    const aliasPart = aliases ? gray('  → ' + aliases) : '';
    console.log('  ' + green(String(i + 1).padStart(2)) + dim('.') + ' ' + cyan(name) + aliasPart);
  });
  console.log('');
  console.log('  ' + yellow('0') + dim('. Ver documentación general (índice)'));
  console.log('  ' + yellow('S') + dim('. Salir'));
  console.log('');
  console.log(gray('  Puedes usar número (1), alias (buscar, flow doc) o número --help. Si escribes una frase, se sugiere la tool.'));
  console.log('');
}

/** Parsea entrada: número, alias, frase (sugerencia). Devuelve { action, toolIndex?, suggestedName? } */
function parseMenuInput(input) {
  const raw = String(input).trim();
  const withHelp = raw.replace(/\s*--help\s*$/i, '').trim();
  const lower = withHelp.toLowerCase();
  if (lower === 's' || lower === 'salir' || lower === 'q') {
    return { action: 'quit' };
  }
  const num = parseInt(withHelp, 10);
  if (num === 0) return { action: 'readme' };
  if (num >= 1 && num <= TOOL_NAMES.length) {
    return { action: 'help', toolIndex: num - 1 };
  }
  const resolved = resolveToToolName(withHelp);
  if (resolved) {
    const idx = TOOL_NAMES.indexOf(resolved);
    if (idx >= 0) return { action: 'help', toolIndex: idx };
  }
  const suggested = suggestToolsByPhrase(withHelp);
  if (suggested.length === 1) {
    return { action: 'help', toolIndex: suggested[0].index, suggestedName: suggested[0].name };
  }
  if (suggested.length > 1) {
    return { action: 'suggest', suggestions: suggested };
  }
  return { action: null };
}

function showReadme() {
  const readmePath = path.join(TOOLS_DIR, 'README.md');
  try {
    if (fs.existsSync(readmePath)) {
      let text = fs.readFileSync(readmePath, 'utf-8');
      text = text.replace(/^## (.+)$/gm, (_, t) => bold(cyan('## ' + t)));
      text = text.replace(/^# (.+)$/gm, (_, t) => bold(cyan('# ' + t)));
      console.log('\n' + dim('─'.repeat(64)));
      console.log(text);
      console.log(dim('─'.repeat(64)) + '\n');
      return;
    }
  } catch (_) {}
  console.log('\n' + dim('Documentación en: ') + TOOLS_DIR + '\n' + gray('Herramientas: ' + TOOL_NAMES.join(', ')) + '\n');
}

function runInteractive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  function ask(question) {
    return new Promise((resolve) => rl.question(question, resolve));
  }

  async function loop() {
    showMenu();
    const opt = await ask(green('» ') + 'Opción (número, alias o frase): ');
    const { action, toolIndex, suggestedName, suggestions } = parseMenuInput(opt);
    if (action === 'quit') {
      console.log(dim('\n  Hasta luego.\n'));
      rl.close();
      return;
    }
    if (action === 'readme') {
      showReadme();
    } else if (action === 'help' && toolIndex !== undefined) {
      const toolName = TOOL_NAMES[toolIndex];
      if (suggestedName) {
        console.log(yellow('\n  ¿Te refieres a ') + cyan(toolName) + yellow('? Mostrando ayuda...\n'));
      }
      showDoc(toolName);
    } else if (action === 'suggest' && suggestions && suggestions.length > 0) {
      console.log(yellow('\n  Varias herramientas podrían coincidir. Elige una:\n'));
      suggestions.forEach((s) => {
        console.log('    ' + green(String(s.index + 1)) + dim('.') + ' ' + cyan(s.name));
      });
      console.log(gray('\n  Escribe el número o el nombre de la herramienta.\n'));
    } else {
      console.log(red('\n  No se reconoció.') + gray(' Usa número (1-9), alias (ej. buscar, flow doc), 0 para índice, S para salir.\n'));
    }
    await loop();
  }

  loop();
}

// Modo directo: nombre o alias --help  o  --help (muestra índice)
const args = process.argv.slice(2);
const first = args[0];
const isHelp = args.some((a) => /^--help$/i.test(a));

if (first && (isHelp || args[1] === '--help')) {
  const raw = isHelp ? first : args[0];
  if (/^--help$/i.test(raw)) {
    showReadme();
    process.exit(0);
  }
  const resolved = resolveToToolName(raw) || raw;
  if (showDoc(resolved)) process.exit(0);
  process.exit(1);
}

if (first && !isHelp) {
  const resolved = resolveToToolName(first);
  if (resolved && showDoc(resolved)) process.exit(0);
  const suggested = suggestToolsByPhrase(first);
  if (suggested.length === 1 && showDoc(TOOL_NAMES[suggested[0].index])) process.exit(0);
  if (showDoc(first)) process.exit(0);
  process.exit(1);
}

runInteractive();
