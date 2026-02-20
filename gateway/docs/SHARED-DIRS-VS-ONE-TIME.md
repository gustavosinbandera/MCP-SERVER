# SHARED_DIRS vs indexación one-time (classic / blueivory)

## Conceptos separados

- **SHARED_DIRS**: Carpeta(s) que el supervisor **revisa siempre** en cada ciclo. Si hay archivos de información o código, se indexan, se almacenan en la BD vectorial y se actualiza SQLite. Es el “shared folder” permanente para indexación continua.

- **Classic y Blueivory**: Se indexan **una sola vez**. Después de esa indexación se **remueven del supervisor** para que no se vuelvan a indexar nunca más (aunque estén en .gitignore en el repo, en la instancia existen y se indexan una vez).

## Reglas

1. Si **embedding no está activo** durante la indexación, el proceso se **cancela** (no se indexa nada). `INDEX_REQUIRE_EMBEDDINGS=true` asegura que sin API key no se indexe.
2. Antes de empezar a indexar (sobre todo la primera vez o tras limpiar), es recomendable **limpiar SQLite** (indexed_keys.db, indexing_stats.db) para partir de un estado conocido.
3. Tras indexar classic y blueivory una vez, se deja **SHARED_DIRS** solo con la carpeta compartida permanente (o vacío si no se usa aún). Classic y blueivory no vuelven a estar en SHARED_DIRS.

## Flujo one-time classic + blueivory

1. Limpiar SQLite (y opcionalmente colección Qdrant si se quiere empezar de cero).
2. En .env: `SHARED_DIRS=classic:classic;blueivory:blueivory`. Reiniciar supervisor.
3. Dejar que corra uno o varios ciclos hasta que indexe todo (o ejecutar `node dist/supervisor.js --once` una vez).
4. En .env: quitar classic y blueivory; dejar `SHARED_DIRS=` o la ruta del shared folder permanente. Reiniciar supervisor.

A partir de ahí, SHARED_DIRS es solo la carpeta que se revisa de forma continua.
