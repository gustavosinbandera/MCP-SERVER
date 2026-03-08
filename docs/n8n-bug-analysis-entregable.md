# Entregable: Build bug context + flujo Local → Remote Bug Analysis

Implementación de las tareas acordadas: prioridad de campos, parseo por secciones, normalización, bug_query compacto, markdown legible, criterio de confianza y compatibilidad v2/legacy/error.

---

## 1. Resumen de cambios aplicados

| # | Tarea | Implementación |
|---|--------|----------------|
| 1 | **Prioridad de campos** | Orden: `description_text` → `expected_behavior_text` → `actual_behavior_text` → `repro_steps_text`. Si los 3 primeros vacíos, se extrae desde `repro_steps_text` por secciones. |
| 2 | **Parseo por secciones en repro_steps_text** | `parseReproSections()` detecta "Steps to Reproduce", "Actual result(s)", "Expected result(s)" con variantes de mayúsculas/minúsculas y "result:"/"results:". |
| 3 | **Normalización previa** | `normalizeText()`: elimina HTML residual, colapsa saltos repetidos y espacios extras, reemplaza `\u00a0`. |
| 4 | **bug_query compacto** | `buildCompactBugQuery()`: bug id, title (≤120), expected (≤200), actual (≤200), pasos resumidos (≤200). **Límite total 1000 caracteres** (dentro de 800–1200). |
| 5 | **4 tools remotas en paralelo** | Documentado en workflow: search_docs (blueivory/code), analize_code (blueivory/code), semgrep_scan (blueivory, p/cpp, continueOnFail=true), tree_sitter_parse. |
| 6 | **Markdown final legible** | Estructura definida: Task ID, Title, Steps to Reproduce (resumen), Actual vs Expected, Tool 1–4 (máx 12–20 líneas o ERROR en 1 línea), Top 3 candidate files, Next technical step. |
| 7 | **Criterio de confianza** | Alta solo si ≥2 tools convergen en el mismo archivo/módulo; si no, confidence: low/medium. |
| 8 | **Compatibilidad** | Si delimitador v2: parsear envelope JSON. Si no: fallback legacy (regex + secciones). Si envelope.error: salida con error_code/error_message. |

---

## 2. Ejemplo de salida markdown final (recortado)

```markdown
# Bug Analysis — Task 132551

## Task ID
132551

## Title
[Blue Ivory] Amount is not display correctly on invoice document

## Steps to Reproduce (resumen)
1. Create order. 2. Generate invoice. 3. Open PDF.

## Actual vs Expected
- **Actual:** Amount shows zero or incorrect value.
- **Expected:** Amount should match the order total.

## Tool 1 — search_docs (blueivory/code)
- Doc 1: InvoiceRenderer.cs — fragment about totals...
- Doc 2: PdfExportService — amount calculation...
(máx 12–20 líneas)

## Tool 2 — analize_code (blueivory/code)
- InvoiceRenderer.cs: updateTotalDisplay()...
(máx 12–20 líneas)

## Tool 3 — semgrep_scan
- rule X at path/to/file.cs:42...
- o bien: ERROR: semgrep scan failed (path blueivory). Continue.

## Tool 4 — tree_sitter_parse
- function_definition: 3, identifier: 12...
(máx 12–20 líneas)

## Top 3 candidate files
1. blueivory/.../InvoiceRenderer.cs
2. blueivory/.../PdfExportService.cs
3. blueivory/.../AmountHelper.cs

## Next technical step
Revisar InvoiceRenderer.updateTotalDisplay() y validar formato de amount en PDF.

---
confidence: high | medium | low (según convergencia de tools)
```

---

## 3. Archivos tocados

| Archivo | Cambios |
|---------|---------|
| `docs/n8n-build-bug-context.js` | Prioridad de campos, `normalizeText`, `parseReproSections`, `buildCompactBugQuery`, regex legacy multilínea, límite bug_query 1000. |
| `docs/n8n-build-bug-context-validation.js` | Misma lógica que el script anterior; caso B2 (legacy con secciones); 4 casos; aserciones para bug_query compacto. |
| `docs/n8n-azure-v2-bug-analysis-workflow.md` | §3.1 prioridad/normalización/bug_query; §3.3 estructura markdown (Steps, Actual vs Expected, Tool 1–4, Top 3, Next step); §3.5 criterio de confianza; checklist (semgrep no rompe flujo); §7 validación 4 casos. |
| `docs/n8n-bug-analysis-entregable.md` | Este entregable (resumen, ejemplo, archivos, validación). |

---

## 4. Resultado de validación (PASS/FAIL por criterio)

Validación ejecutada: `node docs/n8n-build-bug-context-validation.js`

| Criterio | Resultado |
|----------|-----------|
| Caso A — envelope v2 válido: source=azure_v2, title/description/expected/actual correctos, bug_query ≤1000 chars | **PASS** |
| Caso B — legacy sin delimitador: source=legacy_fallback, title extraído | **PASS** |
| Caso B2 — legacy con secciones (Steps/Actual/Expected): expected/actual/repro_steps extraídos | **PASS** |
| Caso C — envelope con error: source=azure_v2_error, error_code=NOT_FOUND, campos vacíos | **PASS** |
| Ya NO sale N/A cuando los datos están en Repro/Expected/Actual (parseo por secciones) | **PASS** (B2 valida extracción desde repro) |
| Markdown final legible y accionable (estructura documentada en workflow) | **PASS** (doc) |
| Fallo de semgrep no rompe el flujo (regla en checklist y §3.3/3.4) | **PASS** (doc + diseño) |

**Validación con task_id 132551:** el script de validación usa payloads que simulan la respuesta de `azure_get_work_item(132551)` en modo compact (Caso A). Los campos description/expected/actual/repro se rellenan desde `data.*`; no se devuelve N/A cuando existen en el envelope. Para comprobar con MCP real: ejecutar el flujo n8n con task_id 132551 y revisar que `source = azure_v2` y que los campos no estén vacíos si Azure los devuelve.

---

**Resumen:** 4/4 casos de validación automática PASS. Documentación y diseño listos para markdown final y criterio de confianza; la generación concreta del markdown y la convergencia de archivos corresponden al nodo “Build markdown draft” en n8n (fuera de este repo).
