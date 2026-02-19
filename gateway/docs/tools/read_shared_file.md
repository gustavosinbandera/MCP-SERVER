# read_shared_file

**Tool MCP:** Lee el contenido de un archivo dentro del directorio compartido (sin índice). La ruta es **relativa** al primer root de `SHARED_DIRS`.

## Cómo usarla: qué argumentos pasar

- **`relative_path`** (obligatorio) — Ruta relativa al archivo dentro del directorio compartido. Ejemplos: `"readme.txt"`, `"src/index.js"`, `"docs/guia.md"`.

**Ejemplo de invocación:**
```
relative_path: "docs/guia.md"
```

## Cuándo usarla

Cuando necesites el contenido completo de un archivo que está en los directorios compartidos (p. ej. un README, un script o un doc concreto).

## Parámetros

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `relative_path` | string | Sí | Ruta relativa al archivo (ej. `readme.txt`, `src/index.js`, `docs/guia.md`). |

## Ejemplo de resultado

```
Archivo: C:\Data\Docs\readme.txt

---

Contenido completo del archivo...
```

Si el archivo no existe, no es un archivo o la ruta escapa del root (path traversal), la tool devuelve un mensaje de error.

## Requisitos

- `SHARED_DIRS` configurado. Solo se usa el **primer** directorio de la lista para leer.
