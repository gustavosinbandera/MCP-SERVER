# list_shared_dir

**Tool MCP:** Lista directorios y archivos en un directorio compartido (sin pasar por el índice de Qdrant). Usa `relative_path` vacío para la raíz del **primer** directorio configurado en `SHARED_DIRS`.

## Cómo usarla: qué argumentos pasar

- **`relative_path`** (opcional) — Ruta relativa dentro del compartido. Vacío o `""` = raíz. Ejemplos: `""`, `"docs"`, `"src/utils"`.

**Ejemplo de invocación (raíz):**
```
relative_path: ""
```
**Ejemplo (subcarpeta):**
```
relative_path: "docs"
```

## Cuándo usarla

Cuando necesites explorar la estructura de archivos de los directorios compartidos (documentación, repos, etc.) sin buscar por contenido.

## Parámetros

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `relative_path` | string | No | Ruta relativa dentro del compartido (ej. `""` raíz, `"docs"` o `"src/utils"`). Default: raíz. |

## Ejemplo de resultado

```
Directorio compartido: C:\Data\Docs
Ruta: (raíz)

Entradas:
README.md
docs/
src/
```

Si la ruta no existe o está fuera del root compartido, devuelve mensaje de error indicando que no se pudo listar.

## Requisitos

- Variable de entorno `SHARED_DIRS` configurada (ej. `proyecto:C:\ruta` o `C:\ruta`). Si está vacía, la tool devuelve un mensaje indicando que no hay directorios compartidos.
