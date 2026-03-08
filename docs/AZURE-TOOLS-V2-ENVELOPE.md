# Azure Tools v2 – Envelope y mejoras para n8n/LLM

Documentación de las mejoras implementadas en las tools de Azure DevOps del MCP Gateway: salida estructurada (envelope), compatibilidad con flujos n8n y clientes legacy, y criterios de éxito.

**Estado:** Implementado (MVP profesional).  
**Referencia:** Plan en conversación; código en `gateway/src/azure/response-envelope.ts` y `gateway/src/mcp-server.ts`.

---

## 1. Objetivo de las mejoras

- Pasar de salidas "texto largo" a **salidas estructuradas**, limpias y accionables.
- Mantener **salida legible para humanos** y añadir **data JSON estable** para automatización (n8n, LLM).
- Reducir ruido, mejorar precisión y hacer el pipeline de bugs confiable.
- **Backward compatible:** clientes y flujos existentes siguen funcionando.

---

## 2. Formato de respuesta (envelope v2)

Todas las tools Azure afectadas pueden devolver un **envelope** con tres partes:

| Campo          | Uso |
|----------------|-----|
| **summary_text** | Texto corto legible (resumen, changelog o líneas tabulares). |
| **data**         | JSON estructurado estable para automatización (items, events, work item compacto, etc.). |
| **meta**         | Metadatos: `tool_version`, `elapsed_ms`, `warnings`, `truncated` (si aplica). |

Formato base (JSON):

```json
{
  "summary_text": "...",
  "data": { "...": "..." },
  "meta": {
    "tool_version": "v2",
    "elapsed_ms": 0,
    "warnings": []
  }
}
```

### Cómo se expone en MCP

El contenido de la tool sigue siendo un único bloque de texto (`content[0].text`):

1. **Parte humana:** todo el texto hasta un delimitador.
2. **Delimitador:** `\n\n<!--AZURE_V2-->\n`
3. **Parte máquina:** el JSON del envelope (o del error).

Así, un cliente que solo muestra el texto sigue viendo el resumen; un cliente que entiende v2 puede parsear el JSON tras el delimitador.

Constante en código: `AZURE_V2_DELIMITER` en `gateway/src/azure/response-envelope.ts`.

---

## 3. Envelope de error

Errores con envelope uniforme:

```json
{
  "error": {
    "code": "AZURE_TIMEOUT | NOT_FOUND | VALIDATION_ERROR | AUTH_ERROR | AZURE_ERROR",
    "message": "...",
    "details": {}
  },
  "meta": { "retryable": true | false, "elapsed_ms": 0 }
}
```

- El mensaje humano (antes del delimitador) se mantiene para lectura directa.
- Códigos usados para clasificación y lógica en n8n/LLM.

---

## 4. Tools modificadas

### 4.1 `azure_get_work_item`

- **Parámetro nuevo:** `mode`: `compact` (por defecto) | `full` | `legacy`.
- **compact:**
  - `data`: objeto con campos canónicos: `id`, `title`, `type`, `state`, `reason`, `assigned_to`, `created_by`, `changed_by`, `created_date`, `changed_date`, `area_path`, `iteration_path`, `severity`, `priority`, y textos limpios:
    - `description_text`, `expected_behavior_text`, `actual_behavior_text`, `repro_steps_text`
  - HTML de Azure (Description, ReproSteps, etc.) convertido a texto plano.
  - Si un campo no existe: `null` (no string vacía).
- **full:** lo mismo que compact más `raw_fields` (campos crudos de la API).
- **legacy:** solo texto legible, sin JSON; mismo aspecto que antes para compatibilidad.
- **meta:** `tool_version: "v2"`, `elapsed_ms`.

### 4.2 `azure_get_work_item_updates`

- **Parámetros nuevos (opcionales):**
  - `summary_only`: por defecto `true` (resumen tipo changelog).
  - `only_relevant_fields`: por defecto `true` (excluye ruido de System.* irrelevante).
  - `include_comments`: por defecto `true` (incluye System.History/comentarios).
  - Sigue existiendo `top` (default 50).
- **data.events[]:** lista normalizada con:
  - `rev`, `author`, `changed_at`, `change_type`, `field`, `old`, `new`
- **summary_text:** changelog breve (top 15 cambios por defecto).
- **meta:** `tool_version: "v2"`, `elapsed_ms`.

### 4.3 `azure_list_work_items`

- **Salida:** siempre envelope v2.
- **data.items[]:** array de objetos con:
  - `id`, `title`, `state`, `type`, `assigned_to`, `changed_date`, `created_date` (si aplica).
- **summary_text:** mismo formato que antes: líneas `#ID [Type] (State) title  YYYY-MM-DD`, para que scripts que parsean por líneas sigan funcionando.
- **meta:** `elapsed_ms` además de `tool_version` y `warnings`.

### 4.4 `azure_list_work_items_by_date`

- Igual que `azure_list_work_items` en cuanto a envelope y `data.items[]`.
- Pensada para n8n cuando se necesitan muchos ítems (paginación interna, hasta 2000).
- **meta:** `elapsed_ms` incluido.

---

## 5. Normalización semántica (campo y personas)

- **Mapeo de campos Azure:** en `response-envelope.ts` se mapean:
  - Description → `description_text`
  - Microsoft.VSTS.TCM.ReproSteps → `repro_steps_text`
  - Expected Results / Custom.ExpectedBehavior → `expected_behavior_text`
  - Actual / Custom.ActualBehavior → `actual_behavior_text`
- **Personas:** `assigned_to`, `created_by`, `changed_by` como `{ display_name, unique_name }` (o `null`).
- **HTML → texto:** función `htmlToPlainText()` para todos los campos de texto largo.

---

## 6. Compatibilidad

| Consumidor        | Comportamiento |
|-------------------|----------------|
| **n8n (nuevo)**   | Parsea el JSON tras `<!--AZURE_V2-->` y usa `data.items` o `data` del work item/updates. |
| **n8n (antiguo)**| Sigue parseando las líneas de `summary_text` (mismo formato de líneas). |
| **Cursor / IDE**  | Siguen viendo solo el texto legible (todo lo que está antes del delimitador). |
| **mode=legacy**  | En `azure_get_work_item` se devuelve solo texto, sin envelope JSON. |
| **Web (REST)**   | Los endpoints `/azure/work-items` y `/azure/work-items/:id` no cambiaron; la web no usa MCP para listado/detalle. |

---

## 7. Uso en n8n

### Script de formateo (tabla)

El script en `docs/n8n-format-work-items-table.js` está actualizado para:

1. **Detectar envelope v2:** si `content[0].text` contiene `<!--AZURE_V2-->`, extraer el JSON.
2. **Usar `data.items`:** si existe `envelope.data.items`, construir la tabla (Markdown/HTML) desde ese array (id, type, state, title, date desde `changed_date` o `created_date`).
3. **Manejar errores:** si `envelope.error` existe, devolver `error: envelope.error.message`.
4. **Fallback legacy:** si no hay envelope o el JSON falla, parsear las líneas del texto como antes (`#ID [Type] (State) title  YYYY-MM-DD`).

Entrada típica en n8n: salida del nodo HTTP Request que llama a `tools/call` con `azure_list_work_items` o `azure_list_work_items_by_date`. La estructura es `items[0].json.result.content[0].text`.

### Ejemplo de flujo

1. HTTP Request → POST al MCP con `tools/call`, body con `work_item_id` o parámetros de list (from_date, type, etc.).
2. Code node → ejecutar la lógica de `n8n-format-work-items-table.js` sobre `$input.first().json`.
3. Usar `tableMarkdown`, `tableHtml` o `rows` en nodos siguientes.

---

## 8. Criterios de éxito (referencia)

- **Latencia:** get_work_item &lt; 2s (p95 local), updates &lt; 5s (objetivo).
- **Campos:** description / expected / actual disponibles como campos limpios cuando existan en Azure.
- **Updates:** resumidos (estado, asignado, reason, iteración, comentarios), sin spam de System.* cuando `only_relevant_fields=true`.
- **Compatibilidad:** clientes antiguos siguen funcionando (texto legible y, en listas, mismo formato de líneas; opción `mode=legacy` en get_work_item).

---

## 9. Archivos relevantes

| Archivo | Descripción |
|---------|-------------|
| `gateway/src/azure/response-envelope.ts` | Envelope, HTML→texto, mapeo de campos, normalización de updates, formato MCP. |
| `gateway/src/azure/index.ts` | Re-export de `response-envelope`. |
| `gateway/src/mcp-server.ts` | Definición de las tools Azure (parámetros, llamadas a envelope y a Azure client). |
| `gateway/src/mcp/tools-catalog.ts` | Descripciones y argumentos de las tools para el catálogo público. |
| `docs/n8n-format-work-items-table.js` | Script n8n para formatear listas de work items en tabla (v2 + legacy). |

---

## 10. Próximas fases (opcional)

- **Fase 3 (más normalización):** mapeador central de campos custom, estados canónicos (new, in_progress, resolved, closed, reopened).
- **Fase 5 (rendimiento):** caché corto (30–120s) para get_work_item y updates; límites/recorte de texto con `meta.truncated`.
- **Fase 6 (observabilidad):** log estructurado por tool call, métricas (éxito, p95, errores por tipo), correlation id.
- **Tests:** unit tests de parsing HTML→texto, mapeo de campos, filtrado de updates; integración con mock Azure; E2E con n8n.
