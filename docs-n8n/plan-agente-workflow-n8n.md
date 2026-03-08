# Plan del agente de workflow n8n

## 1. Contexto y alcance

Este documento separa las responsabilidades del lado del proyecto `n8n`, que sera manejado por un agente de IA distinto al de `MCP-SERVER`.

El objetivo del agente de workflow es construir un flujo robusto que consuma correctamente las tools MCP, reduzca ruido antes del LLM y produzca un draft util para analisis tecnico de bugs.

Este agente **no** debe modificar el codigo fuente del gateway `MCP-SERVER`. Solo debe asumir contratos estables de las tools y adaptar el workflow de `n8n` a esos contratos.

---

## 2. Responsabilidad principal del agente n8n

El agente n8n debe encargarse de:

- definir y mantener el workflow completo,
- mejorar los nodos `HTTP Request` para el protocolo MCP,
- escribir o refinar scripts de nodos `Code`,
- controlar el flujo de evidencia antes del LLM,
- reducir tiempo de ejecucion y ruido,
- hacer que el workflow degrade con elegancia cuando una tool falle.

---

## 3. Problemas que el agente n8n debe resolver

### 3.1 Corregir el handshake MCP en el workflow

Agregar los pasos faltantes despues de cada `initialize`:

- `initialized` para MCP local,
- `initialized` para MCP remoto.

Ademas, el workflow debe:

- reutilizar correctamente `mcp-session-id`,
- cerrar sesiones con `DELETE /mcp` al final,
- evitar asumir paralelismo real sobre una misma sesion.

### 3.2 Forzar uso de Azure v2 estructurado

Cambiar la llamada a `azure_get_work_item` para usar siempre:

```json
{
  "work_item_id": 132551,
  "mode": "compact"
}
```

Con esto, el flujo de `n8n` debe tratar el output v2 como contrato principal y usar legacy solo como fallback.

### 3.3 Reemplazar o alinear `Build bug context`

El script actual debe ser alineado con el contrato documentado en `docs/n8n-build-bug-context.js`.

Debe producir al menos:

- `task_id`
- `title`
- `description`
- `expected_behavior`
- `actual_behavior`
- `repro_steps`
- `bug_query`
- `source`
- `meta`

Y puede extenderse con:

- `project_key`
- `project_branch`
- `project_folder`
- `seed_cpp_file`
- `is_fix`

### 3.4 Crear una etapa formal de seleccion de candidatos

Agregar un nodo `Code` nuevo, por ejemplo `Build candidate paths`, que:

- lea la salida de `search_docs`,
- lea la salida de `analize_code`,
- detecte archivos y paths relevantes,
- asigne score por convergencia,
- derive:
  - `candidate_files`
  - `candidate_dirs`
  - `primary_file`
  - `primary_dir`
  - `scan_path`

### 3.5 Integrar `semgrep_scan` sin volverlo cuello de botella

El workflow debe dejar de mandar `semgrep` a repos completos.

Reglas del agente:

- no usar `path: blueivory` o `path: classic` completos,
- usar directorios pequenos derivados de `primary_dir`,
- usar `config: "p/cpp"` para C/C++,
- preferir `format: "json"`,
- marcar `continueOnFail` cuando aplique,
- degradar a warning si el scan falla o tarda demasiado.

### 3.6 Integrar `tree_sitter_parse`

Agregar un nodo remoto para `tree_sitter_parse` que reciba:

1. `primary_file`, o
2. `seed_cpp_file` como fallback.

Luego agregar un nodo `Code` que resuma la salida del AST en una forma util para el LLM.

### 3.7 Crear una capa de `evidence summary`

Antes del LLM, el workflow debe resumir la evidencia y no mandar texto crudo gigante.

Agregar un nodo `Code` tipo `Build evidence summary` que genere:

- `search_summary`
- `analysis_summary`
- `semgrep_summary`
- `tree_summary`
- `top_candidate_files`
- `confidence_pre_llm`

### 3.8 Redisenar el prompt LLM

El prompt debe dejar de depender de dumps largos y pasar a depender de evidencia resumida.

El LLM debe:

- comparar evidencia,
- inferir el punto probable de falla,
- proponer un siguiente paso tecnico,
- proponer fix solo si la evidencia lo respalda.

### 3.9 Preparar salida estructurada ademas de Markdown

El workflow debe producir dos salidas:

- `markdown_draft`
- `analysis_json`

`analysis_json` debe incluir como minimo:

- `task_id`
- `project_key`
- `candidate_files`
- `confidence`
- `probable_failure_point`
- `recommended_next_step`

---

## 4. Plan por fases del lado n8n

## Fase A - Estabilizacion del protocolo

### Objetivo
Dejar el flujo correcto y estable a nivel MCP.

### Tareas

1. Agregar `initialized` local.
2. Agregar `initialized` remoto.
3. Agregar `DELETE /mcp` local.
4. Agregar `DELETE /mcp` remoto.
5. Forzar `azure_get_work_item(mode=compact)`.

## Fase B - Reestructuracion del contexto

### Objetivo
Mejorar el parsing del bug y la construccion de queries.

### Tareas

1. Reemplazar `Build bug context` por una version alineada con el contrato documentado.
2. Mantener `Build embedding queries`, pero refinarlo para no sesgar demasiado los terminos.
3. Agregar un nodo de normalizacion de proyecto (`blueivory` vs `classic`) solo si sigue siendo necesario.

## Fase C - Seleccion de candidatos

### Objetivo
Reducir el espacio de busqueda antes de las tools costosas.

### Tareas

1. Crear `Build candidate paths`.
2. Calcular score por archivo/path.
3. Derivar `primary_file`, `primary_dir`, `scan_path`.
4. Preparar fallback si no hay suficientes candidatos.

## Fase D - Evidencia tecnica ampliada

### Objetivo
Integrar tools adicionales sin degradar rendimiento.

### Tareas

1. Agregar `semgrep_scan` con subpath pequeno.
2. Agregar `tree_sitter_parse` sobre archivo candidato.
3. Opcional: agregar `grep_code` y `grep_symbols` para enriquecer ranking.

## Fase E - Sintesis controlada

### Objetivo
Mejorar precision del LLM y bajar ruido.

### Tareas

1. Crear `Build evidence summary`.
2. Simplificar `Build LLM Prompt`.
3. Ajustar `Build markdown draft` para trabajar con resumenes y no con dumps crudos.
4. Agregar `analysis_json` como salida paralela.

---

## 5. Reglas operativas para el agente n8n

### 5.1 Regla de sesion MCP

- no asumir paralelismo real sobre una misma sesion,
- si se desea paralelismo real, evaluar sesiones separadas,
- cerrar sesiones al final del flujo.

### 5.2 Regla de uso de Semgrep

- no correr sobre todo el repo,
- no usar `auto` por defecto en C/C++,
- usar directorios pequenos,
- si falla, el flujo debe continuar.

### 5.3 Regla de prompts LLM

- no mandar salidas crudas gigantes,
- no inventar evidencia faltante,
- incluir siempre nivel de confianza,
- citar archivos candidatos concretos.

### 5.4 Regla de resiliencia

Si una tool falla:

- registrar error,
- marcar warning,
- continuar con evidencia restante,
- no romper el flujo completo salvo fallo de handshake MCP o de entrada del bug.

---

## 6. Entregables esperados del agente n8n

El agente de workflow debe entregar:

1. workflow v2 actualizado,
2. scripts `Code` nuevos o refactorizados,
3. outputs mas pequenos y estructurados,
4. manejo correcto de sesiones MCP,
5. integracion controlada de `semgrep_scan` y `tree_sitter_parse`.

---

## 7. Checklist de validacion del lado n8n

- [ ] `initialize` + `initialized` local funciona.
- [ ] `initialize` + `initialized` remoto funciona.
- [ ] `azure_get_work_item(mode=compact)` devuelve envelope usable.
- [ ] `Build bug context` produce contrato estable.
- [ ] `Build candidate paths` produce `primary_file` y `scan_path` utiles.
- [ ] `semgrep_scan` corre sobre subpath pequeno.
- [ ] `tree_sitter_parse` corre sobre archivo candidato.
- [ ] `Build evidence summary` reduce ruido antes del LLM.
- [ ] `Build markdown draft` genera una salida legible.
- [ ] El workflow cierra sesiones MCP.

---

## 8. Resumen ejecutivo

El agente n8n debe enfocarse en orquestacion, seleccion de evidencia, resiliencia y sintesis. No debe resolver problemas internos del gateway, sino consumirlo bien.

Su meta principal es pasar de un flujo MVP a un flujo guiado por evidencia y optimizado para cooperar con `MCP-SERVER` sin acoplarse al codigo interno del otro proyecto.
