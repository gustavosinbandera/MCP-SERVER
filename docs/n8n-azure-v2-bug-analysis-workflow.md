# Azure Tools v2 + n8n: flujo Local → Remote Bug Analysis

Plan de integración: tomar un `task_id` (bug de Azure), obtener contexto v2, ejecutar 4 herramientas en MCP remoto (scope blueivory) y generar un markdown legible para revisión humana.

---

## 1. Estado actual

- **Azure tools v2** ya implementadas con envelope:
  - `summary_text`
  - `data`
  - `meta`
  - delimitador `<!--AZURE_V2-->`
- Workflow puente **local → remote** ya funcional.
- **Problema previo:** ruido excesivo y dependencia de texto legacy.
- **Objetivo:** consumir v2 estructurado y mejorar calidad del draft.

---

## 2. Objetivo funcional

1. Tomar **task_id** manual (bug de Azure).
2. Obtener el bug por **MCP local** (Azure/VPN): `azure_get_work_item` con `mode=compact`.
3. Extraer solo contexto útil:
   - `title`
   - `description_text`
   - `expected_behavior_text`
   - `actual_behavior_text`
   - `repro_steps_text`
4. Ejecutar **4 herramientas en paralelo** en **MCP remoto** (scope blueivory):
   - `search_docs`
   - `analize_code`
   - `semgrep_scan`
   - `tree_sitter_parse`
5. Generar un **markdown legible** para revisión humana.

---

## 3. Cambios recomendados en el workflow

### 3.1 Build bug context (usar Azure v2, no legacy text)

- Parsear `content[0].text` buscando el delimitador: `\n\n<!--AZURE_V2-->\n`
- **Si existe:** parsear JSON del envelope y usar `data.*`.
- **Si no existe:** fallback legacy por regex y por secciones en el texto.
- **Si `envelope.error`:** cortar temprano con error estructurado (`error_code` / `error_message`).

**Prioridad de campos:** 1) `description_text` 2) `expected_behavior_text` 3) `actual_behavior_text` 4) `repro_steps_text` (fallback). Si los 3 primeros están vacíos, se extrae desde `repro_steps_text` por secciones (Steps to Reproduce, Actual result, Expected result; variantes result/results y mayúsculas/minúsculas).

**Normalización:** limpieza de HTML residual, saltos repetidos y espacios extras antes de regex.

**bug_query:** compacto con bug id, title, expected, actual, pasos resumidos; **límite 800–1200 caracteres** (p. ej. 1000).

**Código:** ver **[docs/n8n-build-bug-context.js](n8n-build-bug-context.js)**.

Salida del nodo:

- `task_id`, `title`, `description`, `expected_behavior`, `actual_behavior`, `repro_steps`
- `bug_query` (compacto, ≤1200 chars)
- `source`: `azure_v2` | `legacy_fallback` | `azure_v2_error`
- `azure_summary_text`, `meta`

---

### 3.2 Ajuste de herramientas remotas (scope blueivory)

| Herramienta        | Parámetros recomendados |
|--------------------|--------------------------|
| **search_docs**    | `project: "blueivory"`, `source_type: "code"`, `query: bug_query` |
| **analize_code**   | `component: "blueivory"`, `source_type: "code"`, `description: bug_query` |
| **semgrep_scan**   | `path: "blueivory"`, `config: "p/cpp"`, `format: "text"`, `continueOnFail: true` |
| **tree_sitter_parse** | Archivo semilla conocido en blueivory o archivo candidato del ranking |

---

### 3.3 Build markdown draft (salida legible)

- **No volcar bloques gigantes** de texto crudo.
- Estructura del markdown final:

1. **Task ID**
2. **Title**
3. **Steps to Reproduce** (resumen)
4. **Actual vs Expected**
5. **Tool 1 summary** (search_docs) — máx 12–20 líneas
6. **Tool 2 summary** (analize_code) — máx 12–20 líneas
7. **Tool 3 summary** (semgrep_scan) — máx 12–20 líneas o **ERROR** en 1 línea si falla (no romper flujo)
8. **Tool 4 summary** (tree_sitter_parse) — máx 12–20 líneas
9. **Top 3 candidate files**
10. **Next technical step**

---

### 3.4 Reglas de calidad del draft

- **Máximo 12–20 líneas por herramienta.**
- Si una herramienta falla (p. ej. semgrep): mostrar una sola línea `ERROR: ...` y **no romper el flujo**.
- **Prioridad de evidencia:**
  1. Coincidencia en search_docs + analize_code  
  2. Hallazgos semgrep (si disponibles)  
  3. Confirmación estructural con tree_sitter_parse  

### 3.5 Criterio de confianza

- **Alta confianza:** solo si al menos **2 tools convergen** en el mismo archivo/módulo.
- Si no hay convergencia: marcar **confidence: low** o **confidence: medium** según número de señales.

---

## 4. Checklist de validación (antes de publicar en Azure)

- [ ] Build bug context usa `source = azure_v2` en la mayoría de casos.
- [ ] description / expected / actual no salen en N/A cuando Azure sí tiene esos campos.
- [ ] Las 4 herramientas se ejecutan y devuelven output útil o error controlado.
- [ ] **Fallo de semgrep no rompe el flujo** (se muestra ERROR en 1 línea).
- [ ] Markdown final no excede tamaño razonable.
- [ ] Archivo candidato principal aparece consistentemente en Tool 1 y Tool 2.

---

## 5. Siguiente fase (opcional)

- **Ranking automático de archivos** con score:
  - +3 aparición en Tool 1 (search_docs)
  - +3 aparición en Tool 2 (analize_code)
  - +2 hallazgo semgrep
  - +1 cercanía semántica al bug query
- **Modo publish:** `publish=false` (solo draft interno) / `publish=true` (postear con `azure_add_work_item_comment`).

---

## 6. Nota importante sobre search_docs

- **search_docs** NO busca en el filesystem directo.
- Busca sobre **documentos indexados en Qdrant**.
- Para filesystem / shared dir usar:
  - `list_shared_dir`
  - `read_shared_file`
  - `semgrep_scan`
  - `tree_sitter_parse`

---

## 7. Validación E2E del parser (contrato)

Se valida el contrato del nodo **Build bug context** con tres casos, sin tocar flujo ni configuración. El script usa la misma lógica que `n8n-build-bug-context.js` (sin `$input`/`$node`; recibe `taskId` y payload).

**Ejecución:**

```bash
node docs/n8n-build-bug-context-validation.js
```

**Casos:** A (envelope v2), B (legacy sin delimitador), B2 (legacy con secciones Steps/Actual/Expected en repro), C (envelope con error).

**Criterio de éxito:** los 4 casos pasan (exit code 0). `bug_query` es compacto (≤1000 chars). Fallos de parseo se reportan en salida estándar.

**Archivo:** [n8n-build-bug-context-validation.js](n8n-build-bug-context-validation.js).

---

## 8. Referencias

- **[AZURE-TOOLS-V2-ENVELOPE.md](AZURE-TOOLS-V2-ENVELOPE.md)** — Formato envelope, tools modificadas, compatibilidad.
- **[n8n-build-bug-context.js](n8n-build-bug-context.js)** — Script del nodo Code “Build bug context”.
- **[n8n-build-bug-context-validation.js](n8n-build-bug-context-validation.js)** — Validación E2E del contrato del parser (4 casos: v2, legacy, legacy con secciones, error).
- **[n8n-format-work-items-table.js](n8n-format-work-items-table.js)** — Formateo de listas de work items en tabla (v2 + legacy).
- **[n8n-bug-analysis-entregable.md](n8n-bug-analysis-entregable.md)** — Entregable: resumen de cambios, ejemplo markdown, archivos tocados, validación PASS/FAIL.
