# Tests del gateway

## Ejecutar todos los tests

```bash
cd gateway
npm test
```

Los tests usan Jest y están en `src/**/*.test.ts`. Incluyen:

- **chunking.test.ts** – `chunkText`, umbrales y overlap
- **config.test.ts** – constantes, `getInboxPath`, `getSharedDirsEntries`, `getSharedRoots`
- **embedding.test.ts** – `hasEmbedding`, `getVectorSize`, `embed` (sin API key)
- **search.test.ts** – `indexedKey`, `loadExistingIndexedKeys`, `searchDocs`, `countDocs` (con Qdrant mockeado)
- **logger.test.ts** – niveles y formato JSON
- **shared-dirs.test.ts** – `listSharedDir`, `readSharedFile` (directorio temporal)
- **flow-doc.test.ts** – `writeFlowDocToInbox` (directorio temporal)
- **index.test.ts** – HTTP: health, root, search

## Si hay “JavaScript heap out of memory”

En entornos con poca RAM o muchos workers, Jest puede quedarse sin memoria. Opciones:

1. Aumentar el heap: `NODE_OPTIONS=--max-old-space-size=8192 npm test`
2. Ejecutar sin los tests de chunking: `npm run test:no-chunking`
3. Menos workers: `npm test -- --maxWorkers=2`

El script `npm test` ya usa `--max-old-space-size=4096`.

## Tests que requieren servicios

- **index.test.ts** arranca la app Express (no requiere Qdrant ni OpenAI).
- El resto de tests usan mocks (Qdrant, config, fs donde aplica); no hace falta tener Qdrant ni OpenAI levantados.
