# MCP-SERVER - cambios realizados fase 1

## 1. Objetivo de esta fase

Esta primera fase ejecuta una parte concreta del plan del agente `MCP-SERVER`: mejorar las tools del gateway para que el proyecto `n8n` las pueda consumir de forma mas estable y mas facil de automatizar.

En esta fase se trabajo principalmente sobre:

- `semgrep_scan`
- `tree_sitter_parse`
- catalogo y contratos de tools

---

## 2. Como cooperan `n8n` y `MCP-SERVER`

Los dos proyectos estan aislados, pero cooperan de esta manera:

1. `n8n` actua como cliente MCP por HTTP JSON-RPC.
2. `MCP-SERVER` expone tools en `POST /mcp`.
3. `n8n` invoca tools como:
   - `azure_get_work_item`
   - `search_docs`
   - `analize_code`
   - `semgrep_scan`
   - `tree_sitter_parse`
4. `n8n` toma esos resultados y construye el pipeline de analisis.
5. El LLM vive del lado del workflow, no dentro del gateway.

En esta arquitectura:

- `n8n` orquesta,
- `MCP-SERVER` resuelve herramientas,
- ambos deben acordar contratos claros de entrada y salida.

---

## 3. Problema concreto que motivaba los cambios

El punto mas visible era `semgrep_scan`.

Ya se verifico en la instancia que:

- `semgrep` si esta instalado dentro del contenedor `mcp-gateway`,
- el binario responde correctamente,
- funciona sobre subdirectorios pequenos,
- pero no es practico correrlo sobre todo `/app/blueivory`.

Por tanto, el problema real no era instalacion, sino:

- baja observabilidad de la tool,
- poca informacion estructurada para `n8n`,
- dificultad para distinguir `timeout`, `no findings` y otros errores,
- falta de parametros para controlar alcance y timeout.

---

## 4. Cambios realizados en el codigo

## 4.1 `gateway/src/semgrep-tool.ts`

Se mejoro la tool para que devuelva metadatos utiles para automatizacion.

### Mejoras implementadas

- nuevo delimitador: `<!--SEMGREP_V2-->`
- nuevo campo `status` con valores:
  - `completed`
  - `findings`
  - `no_findings`
  - `timeout`
  - `invalid_input`
  - `execution_error`
- metadatos agregados:
  - `config`
  - `format`
  - `elapsedMs`
  - `timedOut`
  - `exitCode`
  - `includePatterns`
  - `excludePatterns`
  - `parsedJson`
- `timeoutMs` ahora es configurable con limites seguros
- soporte para `include` y `exclude` como listas separadas por coma
- mejor deteccion de timeout real
- mejor diferenciacion entre findings, no findings y error de ejecucion

### Beneficio

Ahora `n8n` puede parsear una salida mucho mas util sin depender solo de texto libre.

## 4.2 `gateway/src/mcp-server.ts`

Se actualizo la exposicion de tools MCP.

### Para `semgrep_scan`

Ahora acepta parametros nuevos:

- `timeout_ms`
- `include`
- `exclude`

Y devuelve:

- resumen humano legible,
- mas un bloque JSON despues de `<!--SEMGREP_V2-->`.

### Para `tree_sitter_parse`

Ahora acepta parametros nuevos:

- `summary_only`
- `max_top_node_types`
- `max_interesting_nodes`

Ademas de devolver el AST tradicional, ahora puede devolver un resumen estructurado y un bloque JSON despues de `<!--TREE_SITTER_V2-->`.

## 4.3 `gateway/src/tree-sitter-tool.ts`

Se agrego una capa de resumen para automatizacion.

### Mejoras implementadas

- nuevo delimitador: `<!--TREE_SITTER_V2-->`
- resumen de arbol con:
  - `totalNodes`
  - `namedNodes`
  - `maxDepth`
  - `topNodeTypes`
  - `interestingNodes`
- modo `summary_only` para evitar devolver AST gigante cuando no hace falta

### Beneficio

`n8n` ya no necesita parsear siempre el AST completo para obtener informacion estructural basica.

## 4.4 `gateway/src/mcp/tools-catalog.ts`

Se actualizo la documentacion interna de las tools para reflejar:

- nuevos parametros,
- nuevos ejemplos,
- uso recomendado sobre subpaths pequenos,
- mejor descripcion para clientes automatizados.

---

## 5. Como usar ahora las tools desde `n8n`

## 5.1 Uso recomendado de `semgrep_scan`

Ejemplo recomendado para C/C++:

```json
{
  "jsonrpc": "2.0",
  "id": 21,
  "method": "tools/call",
  "params": {
    "name": "semgrep_scan",
    "arguments": {
      "path": "blueivory/blueivory/ALO",
      "config": "p/cpp",
      "format": "json",
      "timeout_ms": 45000,
      "exclude": "**/bin/**,**/obj/**"
    }
  }
}
```

### Recomendaciones operativas

- no escanear todo `blueivory` o `classic` como primer intento,
- usar subdirectorios candidatos,
- usar `format: "json"` para flujos automatizados,
- usar `p/cpp` en vez de `auto` para codigo C/C++,
- tratar `timeout` como warning y no como fallo total del pipeline.

## 5.2 Uso recomendado de `tree_sitter_parse`

Ejemplo para resumen solamente:

```json
{
  "jsonrpc": "2.0",
  "id": 22,
  "method": "tools/call",
  "params": {
    "name": "tree_sitter_parse",
    "arguments": {
      "file_path": "blueivory/blueivory/ALO/ALOHelper.cpp",
      "summary_only": true,
      "max_top_node_types": 10,
      "max_interesting_nodes": 12
    }
  }
}
```

### Recomendaciones operativas

- usar `summary_only: true` cuando el objetivo sea ranking o validacion rapida,
- pedir AST completo solo cuando ya existe un archivo candidato fuerte,
- usar el bloque JSON para automatizacion y no solo el texto humano.

---

## 6. Contrato de salida esperado

## 6.1 `semgrep_scan`

La salida ahora tiene dos partes:

1. resumen humano,
2. JSON estructurado tras `<!--SEMGREP_V2-->`.

Campos clave del bloque JSON:

- `target`
- `status`
- `ok`
- `config`
- `format`
- `elapsed_ms`
- `timed_out`
- `exit_code`
- `findings_count`
- `include_patterns`
- `exclude_patterns`
- `error`
- `parsed_json`

## 6.2 `tree_sitter_parse`

La salida ahora tiene dos partes:

1. resumen humano,
2. JSON estructurado tras `<!--TREE_SITTER_V2-->`.

Campos clave del bloque JSON:

- `path`
- `language`
- `summary.totalNodes`
- `summary.namedNodes`
- `summary.maxDepth`
- `summary.topNodeTypes`
- `summary.interestingNodes`
- `ast_included`

---

## 7. Impacto practico para el agente de workflow

Con estos cambios, el agente `n8n` puede ahora:

- distinguir mejor si `semgrep` encontro algo o solo se quedo sin findings,
- detectar timeout sin heuristicas fragiles,
- escanear subpaths con control de timeout y exclusiones,
- usar `tree_sitter_parse` en modo ligero,
- parsear bloques JSON estables despues de delimitadores,
- reducir la cantidad de texto crudo que pasa al LLM.

---

## 8. Limites actuales despues de esta fase

Esta fase mejora bastante la base, pero aun quedan pendientes del lado `MCP-SERVER`:

- evaluar si `search_docs` y `analize_code` deben ofrecer candidatos estructurados,
- estudiar una tool dedicada para ranking de archivos,
- reforzar logs estructurados por tool call,
- decidir si `tree_sitter_parse` debe tener un modo aun mas resumido o especializado,
- evaluar si `semgrep_scan` debe permitir mas controles de alcance.

---

## 9. Archivos modificados en esta fase

- `gateway/src/semgrep-tool.ts`
- `gateway/src/tree-sitter-tool.ts`
- `gateway/src/mcp-server.ts`
- `gateway/src/mcp/tools-catalog.ts`

---

## 10. Resumen ejecutivo

La fase 1 del plan `MCP-SERVER` ya empezo a ejecutarse.

Los cambios realizados fortalecen el gateway como backend cooperante para `n8n`, especialmente en las tools mas tecnicas (`semgrep_scan` y `tree_sitter_parse`).

El sistema sigue separado en dos proyectos, pero ahora la frontera de integracion es mas clara: `n8n` orquesta y el gateway devuelve salidas mas utiles para automatizacion.
