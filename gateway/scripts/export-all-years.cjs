/**
 * Ejecuta export-work-items-to-shared-dirs.cjs para cada año (2026 hacia 2005)
 * con --all-developers. Usa spawn para evitar OOM acumulativo entre años.
 *
 * Uso: node scripts/export-all-years.cjs
 *
 * Opciones pasadas al export:
 *   --max-files 5
 *   --concurrency 1
 *   --overwrite
 */
const { spawn } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, 'export-work-items-to-shared-dirs.cjs');
const BATCH_SIZE = 10;
const START_YEAR = 2026;
const END_YEAR = 2005;

function runExport(year, skip) {
  return new Promise((resolve, reject) => {
    const args = [
      '--max-old-space-size=6144',
      SCRIPT,
      '--year',
      String(year),
      '--top',
      String(BATCH_SIZE),
      '--skip',
      String(skip),
      '--all-developers',
      '--only-bug-fix',
      '--concurrency',
      '1',
      '--max-files',
      '5',
      '--overwrite',
    ];
    const proc = spawn('node', args, {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
      process.stdout.write(d);
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      process.stderr.write(d);
    });
    proc.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });
    proc.on('error', reject);
  });
}

async function main() {
  let totalWritten = 0;
  for (let year = START_YEAR; year >= END_YEAR; year--) {
    console.log(`\n========== YEAR ${year} ==========`);
    let skip = 0;
    let emptyCount = 0;
    while (true) {
      try {
        const result = await runExport(year, skip);
        if (result.stdout.includes('No hay work items')) break;
        if (result.code !== 0 && result.code !== null) {
          console.error(`OOM o error (code ${result.code}), saltando batch year=${year} skip=${skip}`);
          skip += BATCH_SIZE;
          if (skip > 1000) break;
          continue;
        }
        const m = result.stdout.match(/Resumen: \{ total: (\d+), written: (\d+)/);
        if (m) {
          const total = parseInt(m[1], 10);
          const written = parseInt(m[2], 10);
          totalWritten += written;
          if (total === 0) break;
          if (total < BATCH_SIZE) break;
        }
        skip += BATCH_SIZE;
        if (skip > 2000) break;
      } catch (e) {
        console.error(`Error year=${year} skip=${skip}:`, e.message);
        skip += BATCH_SIZE;
        if (skip > 1000) break;
      }
    }
  }
  console.log(`\n========== DONE. Total written this run: ~${totalWritten} ==========`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
