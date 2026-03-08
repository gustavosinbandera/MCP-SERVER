# Evaluacion de la corrida 132551

## 1. Resultado general

La salida obtenida despues de los primeros cambios del lado `MCP-SERVER` muestra una mejora real del sistema:

- el workflow ya produce un `markdown_draft` util,
- el pipeline ya genera `analysis_json`,
- hay archivos candidatos concretos,
- el sistema ya evita proponer un fix inventado sin evidencia fuerte,
- el nivel de confianza se expresa explicitamente.

Esto confirma que la arquitectura cooperativa `n8n` + `MCP-SERVER` ya esta funcionando como base operativa.

---

## 2. Lo positivo de esta salida

### 2.1 El sistema ya encontro un punto probable de falla

La salida enfoca correctamente una zona concreta:

- `blueivory/classicCode/ExpExpl/SalesOrderPage.cpp`
- funcion candidata: `CSalesOrderPage::UpdateTotalAmount`

Eso es una buena senal porque el sistema ya no se queda solo en descripcion semantica del bug; ya aterriza en codigo concreto.

### 2.2 El draft ya tiene estructura util

El `markdown_draft` entrega:

- resumen ejecutivo,
- punto probable de falla,
- archivos candidatos,
- siguiente paso tecnico,
- nivel de confianza.

Eso ya es suficiente para revision humana inicial.

### 2.3 El sistema evita una correccion prematura

La salida no inventa un cambio de codigo todavia. Eso es correcto porque la evidencia aun no alcanza para proponer un fix con alta confianza.

---

## 3. Problemas que todavia se ven en la salida

## 3.1 La evidencia aun depende demasiado de `search_docs` + `analize_code`

Aunque el resultado es util, el draft aun parece apoyarse principalmente en:

- `search_docs`
- `analize_code`

No se ve todavia un peso fuerte de evidencia proveniente de:

- `semgrep_scan`
- `tree_sitter_parse`
- `grep_code`
- `grep_symbols`

### Impacto

El sistema sigue teniendo tendencia a producir salidas razonables pero todavia algo inferenciales.

## 3.2 La lista de `candidate_files` aun tiene ruido

Ejemplos de ruido visible:

- duplicados logicos o versiones paralelas del mismo archivo (`SalesOrderPage.cpp` en varias rutas),
- inclusion de archivos de script o test que pueden no ser prioritarios,
- inclusion de `Test.js` que probablemente no deberia competir alto contra codigo C++ de produccion.

### Impacto

El ranking de candidatos todavia necesita mas filtros y mas estructura.

## 3.3 La salida identifica archivo, pero no una ruta de ejecucion completa

El draft encuentra una zona sospechosa, pero aun no muestra con suficiente precision:

- que simbolos concretos convergieron,
- que evidencia exacta llevo a priorizar ese archivo,
- si hubo confirmacion estructural del AST,
- si hubo hallazgos reales de `semgrep`.

### Impacto

La salida es buena para exploracion, pero aun no es lo suficientemente fuerte para una propuesta de fix automatizada.

## 3.4 La confianza media es correcta, pero todavia no esta bien justificada por convergencia tecnica fuerte

La confianza `medium` parece razonable, pero para subir a `high` hacen falta al menos dos tipos de confirmacion claros, por ejemplo:

- coincidencia semantica,
- coincidencia por grep/simbolo,
- confirmacion estructural con Tree-sitter,
- hallazgo de validacion con Semgrep.

---

## 4. Diagnostico de esta corrida

La salida demuestra que la fase 1 del lado `MCP-SERVER` ayudo, pero tambien deja claro que el siguiente cuello de botella ya no es el runtime de herramientas, sino la calidad del ranking y de la convergencia de evidencia.

En otras palabras:

> el sistema ya puede producir un analisis util, pero todavia necesita una etapa mas fuerte de seleccion y validacion de candidatos antes de la sintesis final.

Adicionalmente, la corrida mostro dos hallazgos tecnicos concretos del lado `MCP-SERVER`:

- `semgrep` con `config: p/cpp` falla por incompatibilidad de registry en Semgrep `1.154.0` (HTTP 404 en `semgrep.dev/c/p/cpp`), por lo que el gateway debe normalizarlo a `p/c`,
- `tree_sitter_parse` podia fallar con `Invalid argument` en archivos grandes por un limite practico alrededor de 32 KB cuando se enviaba todo el source de una vez; esto se corrige parseando el archivo por chunks.

---

## 5. Siguientes mejoras recomendadas del lado MCP-SERVER

## Prioridad alta

### 5.1 Enriquecer soporte para archivos candidatos

El siguiente salto mas util del lado `MCP-SERVER` es ayudar a `n8n` a construir un ranking mas limpio.

Opciones:

- enriquecer `analize_code` con candidatos estructurados,
- enriquecer `search_docs` con paths y scores mejor normalizados,
- o crear una tool nueva tipo `suggest_code_paths`.

### 5.2 Reforzar herramientas de evidencia exacta

Para disminuir ruido y subir confianza, el workflow deberia consumir mas del lado servidor:

- `grep_code`
- `grep_symbols`

Eso ya existe en `MCP-SERVER`, pero el sistema aun no parece aprovecharlo en esta corrida.

### 5.3 Mejorar señal de `tree_sitter_parse`

Si `tree_sitter_parse` va a participar del pipeline, conviene validar su uso real en el runtime remoto y aprovechar su salida resumida para:

- detectar funciones,
- detectar clases,
- justificar mejor por que un archivo quedo arriba en el ranking.

## Prioridad media

### 5.4 Evaluar envelope estructurado para tools no-Azure

El modelo Azure v2 demostro que el patron `texto humano + delimitador + JSON estructurado` funciona bien.

Conviene avanzar en la misma direccion para tools como:

- `search_docs`
- `analize_code`
- `grep_code`
- `grep_symbols`

### 5.5 Mejorar observabilidad por tool call

Conviene reforzar logs del gateway para saber por corrida:

- que tools participaron,
- cuales devolvieron ruido,
- cuales tuvieron salida vacia,
- cuales se truncaron,
- cuanto tiempo tomo cada una.

---

## 6. Siguientes mejoras recomendadas del lado n8n

Aunque este documento esta centrado en `MCP-SERVER`, la salida deja claro que el workflow tambien necesita evolucionar.

### Recomendaciones claras

- agregar `grep_code` y `grep_symbols` al ranking,
- hacer deduplicacion fuerte de paths,
- separar archivos de produccion, tests y scripts,
- bajar peso de archivos de test al momento del ranking,
- usar `semgrep_scan` solo sobre `primary_dir`,
- usar `tree_sitter_parse(summary_only=true)` sobre `primary_file`,
- construir `confidence` con reglas explicitas de convergencia.

---

## 7. Conclusiones practicas

### Lo que ya esta bien

- el sistema ya genera analisis utiles,
- ya propone archivos relevantes,
- ya entrega salida dual: Markdown + JSON,
- ya evita conclusiones demasiado agresivas.

### Lo que falta para subir de nivel

- mejor ranking de candidatos,
- menos ruido de archivos de scripts y tests,
- mas evidencia exacta de codigo,
- mejor justificacion de confianza,
- mas uso de tools estructurales y de grep.

---

## 8. Resumen ejecutivo

La corrida 132551 es una buena senal: el sistema ya es funcional y ya puede ser util para exploracion tecnica.

Sin embargo, el siguiente salto de calidad no depende tanto del LLM, sino de mejorar la convergencia de evidencia y el ranking de candidatos.

La recomendacion mas fuerte despues de esta corrida es:

1. reforzar seleccion de candidatos,
2. incorporar `grep_code` y `grep_symbols`,
3. aprovechar mejor `tree_sitter_parse`,
4. mantener `semgrep_scan` solo como validacion focalizada.
