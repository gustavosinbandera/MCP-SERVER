# Nueva herramienta MCP: list_tools

## Resumen

Se añadió al gateway una herramienta MCP llamada **list_tools** que devuelve, en un único mensaje, la lista de todas las herramientas disponibles con su nombre y una descripción breve de cada una. Así, tanto el usuario como el modelo del editor pueden saber qué herramientas hay y para qué sirven sin depender solo del método de protocolo `tools/list`.

## Qué hace

- **Nombre de la herramienta:** `list_tools`
- **Parámetros:** ninguno
- **Salida:** texto en Markdown con las herramientas numeradas, nombre en negrita y descripción debajo (por ejemplo: "1. **search_docs** – Búsqueda en la documentación indexada...").
- **Cuándo usarla:** cuando el usuario pregunte qué herramientas hay, qué puede hacer el MCP o qué hace cada tool.

## Dónde está implementado

- **Código:** `gateway/src/mcp-server.ts` — registro de la tool y array con nombre + descripción de cada herramienta (incluida la propia `list_tools`). La lista interna debe mantenerse alineada cuando se añadan o cambien otras tools.
- **Documentación:** `gateway/docs/tools/README.md` — tabla de herramientas actualizada para incluir `list_tools` en la sección "Utilidad" y coherente con el resto del listado.

## Relación con el cambio en Git

Commit que introduce esta funcionalidad y la documentación asociada:

**Commit:** `e4fe5f27b72499445b0ea22f8cbeba43772e273f`  
**Enlace:** https://github.com/gustavosinbandera/MCP-SERVER/commit/e4fe5f27b72499445b0ea22f8cbeba43772e273f

Incluye: nueva tool `list_tools` en `mcp-server.ts` y actualización del README de tools con las 25 herramientas y la descripción de `list_tools`.
