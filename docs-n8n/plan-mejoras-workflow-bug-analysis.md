# Plan de mejora del flujo n8n Bug Analysis Bridge

## 1. Estado actual resumido

El flujo actual ya resuelve el caso base:

1. recibe un `task_id`,
2. consulta `azure_get_work_item` por MCP local,
3. construye contexto del bug,
4. consulta `search_docs` y `analize_code` por MCP remoto,
5. sintetiza con LLM,
6. genera un borrador en Markdown.

Eso significa que el workflow ya es un MVP funcional, pero todavia tiene debilidades importantes de robustez, calidad de evidencia, manejo de sesiones MCP y uso de `semgrep`.

---

## 2. Problemas encontrados

### 2.1 Protocolo MCP incompleto en n8n

#### Problema
El flujo hace `initialize`, pero no envia la notificacion `initialized` ni en el MCP local ni en el remoto.

#### Riesgo
Aunque algunas implementaciones toleran esto, el protocolo correcto es:

- `initialize`
- `initialized`
- `tools/call`

No respetarlo puede causar comportamientos inconsistentes o fallos sutiles con ciertos cambios futuros del servidor.

#### Impacto
- menor compatibilidad MCP,
- comportamiento fragil,
- debugging mas dificil.

### 2.2 `azure_get_work_item` no fuerza `mode=compact`

#### Problema
La llamada actual usa `azure_get_work_item` sin `mode: "compact"`.

#### Riesgo
El flujo depende de parseo mixto entre legacy y v2, cuando para automatizacion conviene usar siempre el envelope estructurado.

#### Impacto
- mas logica defensiva de la necesaria,
- mayor probabilidad de parseo inconsistente,
- mas ruido para el nodo `Build bug context`.

### 2.3 El nodo `Build bug context` esta funcional pero demasiado custom

#### Problema
El script actual implementa logica util, pero se aleja del contrato documentado en:

- `docs/n8n-build-bug-context.js`
- `docs/n8n-azure-v2-bug-analysis-workflow.md`

#### Riesgo
Se vuelve mas dificil:
- mantenerlo,
- validarlo,
- compararlo con la documentacion,
- reutilizarlo en otros workflows.

#### Impacto
- deuda tecnica,
- divergencia entre doc y workflow real,
- mas costo de soporte.

### 2.4 Falta de `semgrep_scan` y `tree_sitter_parse` en la ruta principal

#### Problema
El flujo documentado ideal usa 4 fuentes de evidencia:

- `search_docs`
- `analize_code`
- `semgrep_scan`
- `tree_sitter_parse`

Pero el workflow actual solo usa 2.

#### Riesgo
La evidencia queda demasiado apoyada en busqueda semantica y analisis contextual, sin:
- validacion estructural,
- analisis estatico,
- convergencia fuerte entre herramientas.

#### Impacto
- menor confianza tecnica,
- mas probabilidad de conclusiones debiles del LLM,
- menos trazabilidad hacia archivos concretos.

### 2.5 `semgrep` no falla por instalacion: falla por estrategia de uso

#### Hallazgo confirmado
En la instancia remota:

- `semgrep` esta instalado,
- responde `semgrep --version`,
- funciona sobre un subdirectorio pequeno,
- se vuelve impractico sobre todo `/app/blueivory`.

#### Problema real
Se estaba asumiendo que `semgrep` podia explorar grandes arboles como primera herramienta.

#### Riesgo
- timeouts,
- lentitud excesiva,
- percepcion de falla aunque en realidad esta escaneando demasiado.

#### Impacto
- `semgrep_scan` se vuelve poco usable,
- mala UX en n8n,
- desperdicio de tiempo y tokens posteriores.

### 2.6 `semgrep_scan` actual tiene poca observabilidad

#### Problema
El tool actual:
- acepta solo directorios,
- tiene timeout fijo de 120s,
- no siempre devuelve mensajes suficientemente claros para distinguir:
  - sin findings,
  - timeout,
  - config lenta,
  - scan excesivo,
  - fallo de red/reglas.

#### Impacto
Desde n8n, puede parecer que no sirve aunque si este funcionando parcialmente.

### 2.7 Uso de una sola sesion remota para llamadas paralelas

#### Problema
`search_docs` y `analize_code` usan el mismo `mcp-session-id`.

#### Riesgo
El gateway serializa requests por sesion, asi que esas llamadas no son realmente paralelas del lado servidor.

#### Impacto
- menos rendimiento del esperado,
- falsa sensacion de paralelismo,
- crecimiento innecesario del tiempo total del flujo.

### 2.8 Falta cierre explicito de sesiones MCP

#### Problema
El workflow no hace `DELETE /mcp` para cerrar sesiones local y remota.

#### Impacto
- peor higiene operativa,
- sesiones vivas mas tiempo del necesario,
- consumo innecesario de recursos.

### 2.9 Falta una capa de seleccion de candidatos antes del LLM

#### Problema
El LLM consume bloques grandes de salida cruda de tools.

#### Riesgo
- ruido excesivo,
- tokens innecesarios,
- analisis menos preciso,
- tendencia del modelo a resumir en exceso o equivocarse por volumen.

#### Impacto
- mas costo,
- menor calidad del draft,
- menos foco en archivos candidatos.

### 2.10 `semgrep` no debe escanear el repo completo

#### Problema
No existe aun una estrategia formal para derivar un `scan_path` pequeno y relevante.

#### Impacto
- scans lentos,
- alto costo de tiempo,
- dificultad para usar `semgrep` como parte confiable del pipeline.

---

## 3. Diagnostico raiz

La principal debilidad del sistema no esta en Azure ni en el gateway remoto.

La debilidad principal es esta:

> El flujo todavia no tiene una etapa solida de reduccion de espacio de busqueda antes de correr herramientas pesadas o antes de pedir sintesis al LLM.

En otras palabras:

- `search_docs` y `analize_code` deberian servir para localizar candidatos,
- `semgrep_scan` y `tree_sitter_parse` deberian servir para validar candidatos,
- el LLM deberia entrar despues de esa reduccion.

Ahora mismo el flujo salta demasiado rapido al LLM.

---

## 4. Plan detallado de cambios

## Fase 1 - Corregir el contrato MCP y endurecer el flujo base

### Objetivo
Asegurar que el workflow sea correcto a nivel de protocolo y mas estable.

### Cambios necesarios

#### 1. Agregar `initialized` despues de cada `initialize`
Agregar un nodo HTTP Request local y otro remoto con:

```json
{ "jsonrpc": "2.0", "method": "initialized", "params": {} }
```

Usando el mismo `mcp-session-id`.

#### 2. Forzar `azure_get_work_item` con `mode=compact`
Cambiar el body de la tool local a:

```json
{
  "name": "azure_get_work_item",
  "arguments": {
    "work_item_id": "<task_id>",
    "mode": "compact"
  }
}
```

#### 3. Alinear `Build bug context` con el script documentado
Tomar como contrato base el de `docs/n8n-build-bug-context.js` y mantener solo extensiones justificadas:
- `project_key`,
- `project_branch`,
- `project_folder`,
- `seed_cpp_file`,
- `is_fix`.

#### 4. Cerrar sesiones MCP al final
Agregar dos nodos `DELETE /mcp`:
- uno para sesion local,
- otro para sesion remota.

## Fase 2 - Introducir una etapa formal de seleccion de candidatos

### Objetivo
No usar `semgrep` ni LLM sobre un universo demasiado amplio.

### Cambios necesarios

#### 1. Crear nodo `Build candidate paths`
Nuevo nodo `Code` que:

- lea resultados de `search_docs`,
- lea resultados de `analize_code`,
- extraiga archivos o paths repetidos,
- rankee candidatos por frecuencia/senal,
- derive:
  - `candidate_files`
  - `candidate_dirs`
  - `primary_file`
  - `primary_dir`

### Regla recomendada de score
- +3 si aparece en `search_docs`
- +3 si aparece en `analize_code`
- +2 si coincide con terminos del bug
- +1 si esta cerca del area funcional esperada

#### 2. Generar `scan_path` pequeno
Si hay archivo candidato:
- usar su directorio como `scan_path`.

Si no hay archivo:
- usar carpeta seed por proyecto.

#### 3. Generar `tree_sitter_file`
Prioridad:
1. `primary_file`
2. `seed_cpp_file`

## Fase 3 - Integrar `semgrep_scan` correctamente

### Objetivo
Hacer que `semgrep` sea util, rapido y controlado.

### Cambios necesarios

#### 1. No usar `path: blueivory` o `path: classic` completos
Siempre usar subdirectorios pequenos derivados del ranking de candidatos.

#### 2. Evitar `config: auto` para C/C++
Usar por defecto:

```json
{
  "config": "p/cpp"
}
```

#### 3. Usar `format: json`
Esto facilita:
- contar findings,
- resumir resultados,
- alimentar el LLM con menos ruido.

#### 4. Configurar `continueOnFail`
Si `semgrep` falla:
- no romper el flujo,
- guardar error estructurado,
- seguir con las otras evidencias.

#### 5. Mejorar el tool `semgrep_scan`
Cambios recomendados en el gateway:
- mensaje claro si no hay findings,
- mensaje claro si hay timeout,
- reportar duracion,
- reportar numero de findings,
- idealmente permitir timeout configurable,
- idealmente permitir exclusiones.

## Fase 4 - Integrar `tree_sitter_parse` correctamente

### Objetivo
Usar evidencia estructural del codigo, no solo textual.

### Cambios necesarios

#### 1. Ejecutar `tree_sitter_parse` sobre un archivo candidato
No usarlo a ciegas.
Debe recibir:
- `primary_file`,
- o `seed_cpp_file` como fallback.

#### 2. Resumir su salida antes del LLM
No enviar AST completa al modelo si es muy grande.
Crear un nodo `Code` que extraiga:
- tipo de nodos,
- nombres de funciones,
- clases,
- simbolos relevantes,
- si existe estructura que coincida con el bug.

## Fase 5 - Crear una capa de resumen tecnico de evidencia

### Objetivo
Reducir ruido antes del LLM.

### Cambios necesarios

Agregar un nodo `Code` tipo `Build evidence summary` que:
- reciba salidas de las 4 tools,
- recorte cada una a 12-20 lineas utiles,
- genere:
  - `search_summary`
  - `analysis_summary`
  - `semgrep_summary`
  - `tree_summary`
  - `top_candidate_files`
  - `confidence_pre_llm`

### Reglas recomendadas
- Si una tool falla: una linea `ERROR: ...`
- Si una tool no encuentra nada: `No strong findings`
- Si dos tools convergen en el mismo archivo: marcar alta senal

## Fase 6 - Redisenar el prompt del LLM

### Objetivo
Subir precision y bajar ruido/tokens.

### Cambios necesarios

#### 1. No enviar salidas crudas gigantes
Enviar:
- contexto del bug,
- resumenes por tool,
- top 3 candidate files,
- evidencia exacta relevante.

#### 2. Cambiar el objetivo del LLM
El LLM no debe descubrir todo desde cero.
Debe:
- comparar evidencias,
- explicar la ruta probable,
- proponer fix solo si esta respaldado.

#### 3. Anadir regla de confianza
- `high`: 2 o mas tools convergen en mismo archivo/modulo
- `medium`: senales parciales
- `low`: evidencia debil o dispersa

## Fase 7 - Mejoras operativas del sistema

### Objetivo
Que el sistema sea mantenible y observable.

### Cambios necesarios

#### 1. Logging por tool en n8n
Guardar para cada tool:
- nombre,
- args,
- duracion,
- exito/fallo,
- tamano de salida.

#### 2. Metricas de costo del LLM
Mantener y enriquecer con:
- tiempo de respuesta,
- tamano del prompt,
- tamano del output.

#### 3. Versionado del workflow
Mantener una version `v2` del workflow, no sobrescribir el MVP sin respaldo.

#### 4. Testing manual por etapas
Validar cada tramo por separado:
- MCP local initialize + initialized
- azure_get_work_item compact
- Build bug context
- remote search_docs
- remote analize_code
- candidate ranking
- semgrep on subdir
- tree_sitter on file
- evidence summary
- LLM synthesize
- markdown final

---

## 5. Arquitectura recomendada del flujo v2

```text
Manual Trigger
  -> Input task id
  -> MCP local initialize
  -> MCP local initialized
  -> Local azure_get_work_item(mode=compact)
  -> Build bug context
  -> Build embedding queries
  -> MCP remote initialize
  -> MCP remote initialized
  -> Remote search_docs
  -> Remote analize_code
  -> Merge
  -> Build candidate paths
  -> Remote semgrep_scan(candidate_dir, p/cpp, json)
  -> Remote tree_sitter_parse(primary_file)
  -> Merge all evidence
  -> Build evidence summary
  -> Build LLM prompt
  -> LLM synthesize
  -> Build markdown draft
  -> Close remote session
  -> Close local session
```

---

## 6. Reglas concretas para `semgrep`

### Reglas operativas recomendadas

- Nunca escanear repo completo como primer paso.
- Siempre escanear subdirectorio pequeno.
- Para C/C++, usar `p/cpp`.
- Preferir `json` sobre `text`.
- Permitir fallo sin romper flujo.
- Si tarda demasiado, degradar a:
  - skip,
  - warning,
  - continuar con otras evidencias.

### Estrategia de fallback
Si no se puede derivar `scan_path` confiable:
1. usar `tree_sitter_parse`,
2. usar `grep_code`,
3. omitir `semgrep` en esa ejecucion.

---

## 7. Sugerencias adicionales para mejorar el sistema

### 7.1 Anadir `grep_code` y `grep_symbols` al pipeline
Esto puede mejorar mucho el ranking antes de `semgrep`.

#### Uso sugerido
- `grep_code` para terminos extraidos del bug
- `grep_symbols` para funciones/clases relevantes

#### Beneficio
- mas precision en seleccion de archivos,
- menos dependencia del embedding,
- menos carga al LLM.

### 7.2 Separar descubrimiento de validacion
Dos etapas logicas:

#### Descubrimiento
- `search_docs`
- `analize_code`
- `grep_code`
- `grep_symbols`

#### Validacion
- `tree_sitter_parse`
- `semgrep_scan`

Esto hace el flujo mas explicable y mas robusto.

### 7.3 Anadir modo `publish=false / true`
Muy recomendable para operar seguro.

#### `publish=false`
- solo genera draft interno

#### `publish=true`
- publica comentario en Azure con `azure_add_work_item_comment`

### 7.4 Crear salida estructurada ademas de Markdown
Ademas del draft final, devolver JSON con:
- `task_id`
- `project_key`
- `candidate_files`
- `confidence`
- `probable_failure_point`
- `recommended_next_step`

Esto facilita futuros dashboards o automatizaciones.

---

## 8. Prioridad recomendada de implementacion

### Prioridad alta
1. agregar `initialized`
2. usar `mode: compact`
3. alinear `Build bug context`
4. crear `Build candidate paths`
5. integrar `semgrep_scan` sobre subdirectorios pequenos
6. integrar `tree_sitter_parse`
7. resumir evidencia antes del LLM

### Prioridad media
8. cerrar sesiones MCP
9. mejorar observabilidad del tool `semgrep_scan`
10. agregar `grep_code` y `grep_symbols`

### Prioridad baja
11. modo publish
12. salidas JSON adicionales
13. metricas ampliadas y dashboards

---

## 9. Resultado esperado tras los cambios

Si aplicas este plan, el sistema deberia mejorar en:

- robustez MCP,
- calidad tecnica,
- rendimiento,
- mantenibilidad,
- confiabilidad,
- explicabilidad.

---

## 10. Recomendacion final

La mejor mejora inmediata no es tocar el LLM primero.

La mejor mejora inmediata es esta:

1. formalizar el protocolo MCP,
2. introducir seleccion de candidatos,
3. usar `semgrep` solo sobre directorios pequenos,
4. resumir evidencia antes del prompt final.

Eso te va a dar el mayor salto de calidad con menor riesgo.
