/**
 * Borra la colección mcp_docs para permitir recrearla con el tamaño de vector correcto
 * (p. ej. 1536 cuando se activa OpenAI). Ejecutar desde gateway: node scripts/migrate-collection-size.cjs
 * Requiere: QDRANT_URL (default http://localhost:6333). Carga .env si existe (dotenv).
 */
try {
  require('dotenv/config');
} catch {
  // dotenv opcional
}

const { QdrantClient } = require('@qdrant/js-client-rest');

const QDRANT_URL = (process.env.QDRANT_URL || 'http://localhost:6333').trim();
const COLLECTION = 'mcp_docs';

async function main() {
  const client = new QdrantClient({ url: QDRANT_URL, checkCompatibility: false });
  const collections = await client.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION);
  if (!exists) {
    console.log('Colección', COLLECTION, 'no existe. Nada que borrar.');
    return;
  }
  await client.deleteCollection(COLLECTION);
  console.log('Colección', COLLECTION, 'borrada. Reinicia el gateway/supervisor para que se cree con el tamaño correcto (1536 con OpenAI).');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
