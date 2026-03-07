# Ejemplo de uso: Tree-sitter y Semgrep con varios archivos de blueivory

La carpeta **MCP-SERVER/blueivory** existe en el repo (está en `.gitignore`). Estructura típica: `blueivory/blueivory/ALO/...` con archivos `.cpp` y `.h`.

---

## Prompt de ejemplo (pegar en el chat)

```
Usa tree_sitter_parse con estos archivos de MCP-SERVER/blueivory y dime para cada uno qué nodos de función (function_definition, declaración de métodos/clases) hay en el AST:

1. blueivory/blueivory/ALO/ALOHelper.cpp
2. blueivory/blueivory/ALO/ALOHelper.h
3. blueivory/blueivory/ALO/ALO.Common/FormLogicBase.cpp
4. blueivory/blueivory/ALO/alo_common_logic.cpp

Resume al final: cuántas funciones por archivo y qué tipos de nodo aparecen.
```

---

## Variante: Tree-sitter + Semgrep

```
Para la carpeta blueivory del repo:

1. Ejecuta tree_sitter_parse sobre estos archivos y resume nodos de función/clase:
   - blueivory/blueivory/ALO/ALOHelper.cpp
   - blueivory/blueivory/ALO/ALO.Common/FormLogicBase.cpp
   - blueivory/blueivory/ALO/alo_address_logic.cpp

2. Luego ejecuta semgrep_scan con path "blueivory", config "p/cpp", format "text", y resúmeme los hallazgos.
```

---

## Rutas (project root = MCP-SERVER)

- **tree_sitter_parse:** `file_path` relativo a la raíz del repo, p. ej. `blueivory/blueivory/ALO/ALOHelper.cpp`.
- **semgrep_scan:** `path` = `blueivory` (escanea todo el árbol bajo esa carpeta).
- Usa el MCP **local** (usar-mcp) para que la raíz sea tu repo y se resuelvan estas rutas; en la instancia remota el código de blueivory no suele estar montado.

---

## Resumen de herramientas

| Herramienta           | Uso con blueivory |
|----------------------|--------------------|
| **tree_sitter_parse** | `file_path`: `blueivory/ruta/al/archivo.cpp` (o .h, .js, .ts). Devuelve AST en S-expression. |
| **semgrep_scan**      | `path`: `blueivory`, `config`: `p/cpp` o `auto`. Escanea todo el árbol. |

*Documento de ejemplo para uso con múltiples archivos de blueivory.*
