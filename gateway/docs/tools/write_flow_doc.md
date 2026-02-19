# write_flow_doc

**Tool MCP:** Crea un documento markdown (nodo del mapa de flujos) y lo guarda en `INDEX_INBOX_DIR` para que el supervisor lo indexe en el próximo ciclo.

## Cómo usarla: qué argumentos pasar

La tool se ejecuta desde el editor (Cursor/VS Code) cuando la IA la invoca. Tú le pides a la IA que “guarde un documento de flujo” y ella rellena los argumentos. Si invocas la tool tú mismo (p. ej. desde otro cliente MCP), envía un objeto con estas claves:

**Mínimo (obligatorio):**
- `title` — Título corto del flujo (ej. `"Flujo de facturación"`).
- `description` — Descripción del flujo o del nodo (texto libre).

**Opcional:**
- `files` — Archivos relacionados; uno por línea (ej. `"src/invoice.ts\nsrc/order.ts"`).
- `functions` — Funciones relacionadas; una por línea (ej. `"createInvoice()\nvalidateOrder()"`).
- `flow_summary` — Resumen del flujo o pasos (texto libre).
- `bug_id` — ID del bug (ej. `"BUG-123"`).
- `project` — Proyecto o área (ej. `"accounting"`, `"shipment"`).

**Ejemplo de invocación (valores concretos):**

```
title: "Bug factura duplicada"
description: "El sistema genera facturas duplicadas cuando el usuario confirma el pedido dos veces. Afecta a createInvoice y a la cola de órdenes."
files: "src/invoice.ts\nsrc/order.ts\nsrc/queue.ts"
functions: "createInvoice()\nvalidateOrder()"
flow_summary: "1. Usuario confirma pedido. 2. Se llama createInvoice(). 3. Si hay timeout, se reintenta y a veces se duplica."
bug_id: "BUG-456"
project: "accounting"
```

Solo `title` y `description` son obligatorios; el resto puedes omitirlo o dejarlo vacío.

## Cuándo usarla

1. Si el usuario dice "usar-mcp": crea el documento y empieza a añadir la información que forme un mapa de cómo se interconecta el código (archivos, funciones, descripción del flujo).
2. Si usas `analize_code` o `search_docs` y obtienes resultados relevantes: crea el documento y almacénalo para que pase a formar parte del mapa de flujos.

Los documentos llevan en el frontmatter `generated_by_ia: true` y `source: ai_generated`.

## Parámetros (resumen)

| Parámetro     | Tipo   | Obligatorio | Descripción |
|---------------|--------|-------------|-------------|
| `title`       | string | Sí          | Título del flujo. |
| `description` | string | Sí          | Descripción del flujo o nodo. |
| `files`       | string | No          | Archivos relacionados (uno por línea). |
| `functions`   | string | No          | Funciones relacionadas (una por línea). |
| `flow_summary`| string | No          | Resumen del flujo o pasos. |
| `bug_id`      | string | No          | ID del bug asociado. |
| `project`     | string | No          | Proyecto/área (ej. accounting, shipment). |

## Resultado que obtienes

Mensaje de confirmación en texto, por ejemplo:
`Documento de flujo guardado en [ruta]. El supervisor lo indexará en el próximo ciclo (inbox)...`

## Nota

El archivo se nombra `flow-{slug}-{YYYY-MM-DD}.md`. Si mismo título y fecha, puede colisionar; en futuras versiones se puede añadir sufijo único.
