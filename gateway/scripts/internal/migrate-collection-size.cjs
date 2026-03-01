/**
 * Borra la colección mcp_docs para permitir recrearla con el tamaño de vector correcto
 * (p. ej. 1536 cuando se activa OpenAI). Ejecutar desde gateway: node scripts/migrate-collection-size.cjs
 * Requiere: QDRANT_URL (default http://localhost:6333). Carga .env si existe (dotenv).
 */
const { loadGatewayEnv } = require('../_shared/script-env.cjs');
loadGatewayEnv();

const { QdrantClient } = require('@qdrant/js-client-rest');

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function usage() {
  const url = (process.env.QDRANT_URL || 'http://localhost:6333').trim();
  const col = (getArg('--collection') || 'mcp_docs').trim();
  const phrase = `DELETE ${col} on ${url}`;
  console.log('Usage:');
  console.log('  node scripts/internal/migrate-collection-size.cjs [--collection <name>] [--list]');
  console.log('  node scripts/internal/migrate-collection-size.cjs --delete --confirm "<PHRASE>" [--collection <name>] [--snapshot]');
  console.log('');
  console.log('Safety:');
  console.log('- This script is SAFE by default. It will not delete anything unless you pass --delete AND --confirm.');
  console.log('- The required confirmation phrase is:');
  console.log(`  "${phrase}"`);
  console.log('');
  console.log('Options:');
  console.log('  --list                 List Qdrant collections and exit.');
  console.log('  --collection <name>    Collection name (default: mcp_docs).');
  console.log('  --snapshot             Best-effort create a snapshot before deleting (if supported).');
  console.log('  --delete               Perform deletion (requires --confirm).');
  console.log('  --confirm "<PHRASE>"   Must match exactly. See above.');
  console.log('  --help, -h             Show this help.');
}

if (hasFlag('--help') || hasFlag('-h')) {
  usage();
  process.exit(0);
}

const QDRANT_URL = (process.env.QDRANT_URL || 'http://localhost:6333').trim();
const COLLECTION = String(getArg('--collection') || 'mcp_docs').trim();
const WANT_LIST = hasFlag('--list');
const WANT_DELETE = hasFlag('--delete');
const WANT_SNAPSHOT = hasFlag('--snapshot');
const CONFIRM = getArg('--confirm');

async function main() {
  const client = new QdrantClient({ url: QDRANT_URL, checkCompatibility: false });
  const collections = await client.getCollections();
  const names = (collections.collections || []).map((c) => c.name).filter(Boolean);

  if (WANT_LIST) {
    console.log(`QDRANT_URL=${QDRANT_URL}`);
    console.log(`Collections (${names.length}):`);
    for (const n of names) console.log(`- ${n}`);
    return;
  }

  const exists = names.includes(COLLECTION);
  console.log(`QDRANT_URL=${QDRANT_URL}`);
  console.log(`Target collection: ${COLLECTION}`);
  console.log(`Exists: ${exists ? 'yes' : 'no'}`);
  console.log('');
  console.log('Dry run by default. Nothing will be deleted unless you pass --delete and --confirm.');

  if (!WANT_DELETE) {
    console.log('');
    console.log('To delete, run:');
    console.log(`  node scripts/internal/migrate-collection-size.cjs --delete --confirm "DELETE ${COLLECTION} on ${QDRANT_URL}"`);
    return;
  }

  const requiredPhrase = `DELETE ${COLLECTION} on ${QDRANT_URL}`;
  if (!CONFIRM || String(CONFIRM) !== requiredPhrase) {
    console.error('');
    console.error('Refusing to delete.');
    console.error('Missing or invalid --confirm phrase.');
    console.error(`Required: "${requiredPhrase}"`);
    process.exit(2);
  }

  if (!exists) {
    console.log('Collection does not exist. Nothing to delete.');
    return;
  }

  if (WANT_SNAPSHOT) {
    // Best-effort: snapshot support may vary by client/server version.
    try {
      if (typeof client.createSnapshot === 'function') {
        const snap = await client.createSnapshot(COLLECTION);
        console.log('Snapshot created:', JSON.stringify(snap));
      } else {
        console.log('Snapshot skipped: client does not expose createSnapshot().');
      }
    } catch (err) {
      console.log('Snapshot failed (continuing):', err && err.message ? err.message : String(err));
    }
  }

  await client.deleteCollection(COLLECTION);
  console.log(`Deleted collection "${COLLECTION}". Restart gateway/supervisor and reindex to recreate it with the correct vector size.`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
