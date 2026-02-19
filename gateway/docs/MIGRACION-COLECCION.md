# Migración de colección Qdrant (size 1 → 1536)

Cuando activas embeddings de OpenAI por primera vez, la colección `mcp_docs` puede existir ya con vectores de tamaño **1** (modo sin embeddings). Los modelos de OpenAI (p. ej. `text-embedding-3-small`) producen vectores de **1536** dimensiones. Qdrant no permite cambiar el tamaño de los vectores de una colección existente, por lo que hay que recrear la colección.

## Cuándo aplicar

- Ya tenías el gateway corriendo **sin** `OPENAI_API_KEY` (o con key vacía) y la colección `mcp_docs` se creó con `size: 1`.
- Ahora configuras `OPENAI_API_KEY` y quieres búsqueda semántica.
- Al indexar o buscar, ves errores del tipo: dimension mismatch o que el vector tiene 1536 pero la colección espera 1.

## Opción 1: Borrar y reindexar (recomendado)

1. **Detén** el gateway y el supervisor para que no escriban en Qdrant durante la migración.
2. **Borra** la colección `mcp_docs` en Qdrant:
   - Por API: `DELETE http://<QDRANT_URL>/collections/mcp_docs`
   - O usa el script incluido (ver más abajo).
3. **Arranca** de nuevo el gateway/supervisor. En el primer uso se creará la colección con el tamaño correcto (1536 si hay `OPENAI_API_KEY`).
4. **Reindexa** todo: inbox, SHARED_DIRS y las URLs que quieras. Los documentos se volverán a indexar con vectores reales.

## Opción 2: Script de migración

En la raíz del gateway puedes usar el script que borra la colección y opcionalmente verifica que se pueda crear de nuevo:

```bash
node scripts/migrate-collection-size.cjs
```

El script:
- Lee `QDRANT_URL` del entorno (o `.env` si existe).
- Borra la colección `mcp_docs` si existe.
- Opcionalmente crea la colección con el tamaño actual (1536 con embeddings, 1 sin ellos) para comprobar que el gateway puede trabajar después.

**Variables de entorno:** `QDRANT_URL` (opcional). Si usas `dotenv`, carga el `.env` antes de ejecutar el script.

## Resumen

| Situación                         | Acción                                      |
|----------------------------------|---------------------------------------------|
| Colección con size 1, activas OpenAI | Borrar `mcp_docs`, reiniciar, reindexar todo |
| Colección ya con size 1536       | No hacer nada                               |
| Primera vez con OpenAI          | La colección se crea con 1536 automáticamente |
