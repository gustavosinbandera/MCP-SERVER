/**
 * Indexa docs_repo/docs/ejemplo.txt en Qdrant (colección mcp_docs).
 * Ejecutar desde gateway: node scripts/index-example-doc.cjs
 * Requiere: QDRANT_URL (default http://localhost:6333), stack Docker arriba.
 */
const path = require('path');
const fs = require('fs');
const { QdrantClient } = require('@qdrant/js-client-rest');
const { gatewayRoot } = require('../_shared/script-env.cjs');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'mcp_docs';

const docsPath = path.join(gatewayRoot(), '..', 'docs_repo', 'docs', 'ejemplo.txt');

async function main() {
  const content = fs.readFileSync(docsPath, 'utf8');
  const title = 'Ejemplo (ejemplo.txt)';

  const client = new QdrantClient({ url: QDRANT_URL, checkCompatibility: false });

  const collections = await client.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION);
  if (!exists) {
    await client.createCollection(COLLECTION, {
      vectors: { size: 1, distance: 'Cosine' },
    });
    console.log('Colección', COLLECTION, 'creada.');
  }

  await client.upsert(COLLECTION, {
    wait: true,
    points: [
      {
        id: 1,
        vector: [0],
        payload: { title, content },
      },
    ],
  });
  console.log('Documento indexado:', title);
  console.log('Puedes preguntar a la IA: "¿Qué dice el documento de ejemplo?" o "Busca en la documentación: ejemplo"');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
