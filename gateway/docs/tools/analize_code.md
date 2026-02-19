# analize_code

**Tool MCP:** Análisis de código con contexto desde la BD. Busca en el Knowledge Hub documentación relevante según una descripción (bug, funcionalidad, componente) y devuelve conteo de docs + fragmentos para que la IA analice el código con ese contexto.

## Cómo usarla: qué argumentos pasar

- **`description`** (obligatorio) — Descripción del bug, funcionalidad o componente. Ejemplo: `"facturación bug duplicado"`, `"login con SSO"`.
- **`component`** (opcional) — Nombre del componente; se suma a la búsqueda. Ejemplo: `"invoicing"`.
- **`project`** (opcional) — Filtrar por proyecto. Ejemplo: `"accounting"`.
- **`limit`** (opcional) — Máximo de resultados (default 15, máx. 30). Ejemplo: `20`.

**Ejemplo de invocación:**
```
description: "bug factura duplicada al confirmar pedido"
component: "invoicing"
project: "accounting"
limit: 10
```

## Cuándo usarla

- El usuario pide analizar código, reporta un bug o necesita contexto desde la documentación indexada.
- Quieres dar a la IA fragmentos de docs relacionados con un componente o tema antes de que revise código.

## Parámetros

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `description` | string | Sí | Descripción del bug, funcionalidad o componente (se usa como query de búsqueda). |
| `component` | string | No | Nombre del componente (se añade a la query). |
| `project` | string | No | Filtrar resultados por proyecto. |
| `limit` | number | No | Máximo de resultados (default 15, máx. 30). |

## Ejemplo de resultado

```
[ANÁLISIS DE CÓDIGO – contexto desde la BD]
Colección: mcp_docs | Documentos totales indexados: 120 | Proyecto: accounting
Búsqueda: "facturación bug duplicado" → 5 resultado(s) relevantes

[1] docs/bugs/facturacion-duplicada.md
Ruta: accounting/docs/bugs/facturacion-duplicada.md | Proyecto: accounting
El bug se presenta cuando...

---
[2] src/invoicing/README.md
...
```

## Diferencia con search_docs

- **search_docs**: búsqueda directa; devuelve título + contenido.
- **analize_code**: misma búsqueda pero con encabezado de “análisis de código”, total de docs en la colección y metadatos (URL, source_path, project) para que la IA tenga contexto estructural.
