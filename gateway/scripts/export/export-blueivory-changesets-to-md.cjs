/**
 * Lee la lista de changesets (desde stdin o archivo) y escribe docs/blueivory-changesets.md.
 * Uso:
 *   type agent-tools-output.txt | node scripts/export-blueivory-changesets-to-md.cjs
 *   node scripts/export-blueivory-changesets-to-md.cjs < agent-tools-output.txt
 *   node scripts/export-blueivory-changesets-to-md.cjs path/to/output.txt
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const inputPath = args[0];
const outDir = path.join(__dirname, '..', '..', 'docs');
const outPath = path.join(outDir, 'blueivory-changesets.md');

function readInput(cb) {
  if (inputPath) {
    try {
      const raw = fs.readFileSync(inputPath, 'utf8');
      return cb(null, raw);
    } catch (e) {
      return cb(e);
    }
  }
  let chunks = [];
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', () => cb(null, chunks.join('')));
  process.stdin.resume();
}

readInput((err, raw) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().startsWith('#'));
  const header = `# Lista de changesets – Blue Ivory (excl. Classic/Core)

Proyecto: **blueivory** únicamente (ruta TFVC BLUE-IVORY-MAIN). Excluidos Classic y Core.
Total en Azure DevOps: **1413**. Esta exportación: **${lines.length}** changesets (todos los desarrolladores).

Formato: \`#ID  Autor  Fecha  Comentario\`

---

`;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, header + lines.map((l) => '- ' + l.trim()).join('\n'), 'utf8');
  console.log('Escrito:', outPath, '(', lines.length, 'changesets)');
});
