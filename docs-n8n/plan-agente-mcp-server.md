# Plan del agente de MCP-SERVER

> Estado actual: fase 1 iniciada. Cambios implementados documentados en `docs-n8n/mcp-server-cambios-fase-1.md`.

## 1. Contexto y alcance

Este documento separa las responsabilidades del lado del proyecto `MCP-SERVER`, que sera operado desde el editor actual con OpenCode UI.

El objetivo del agente `MCP-SERVER` es mejorar las tools, contratos y mensajes del gateway para que el workflow de `n8n` pueda consumirlos de manera estable, rapida y predecible.

Este agente **no** debe modificar el workflow de `n8n` directamente. Debe enfocarse en mejorar el comportamiento del servidor, sus tools y la claridad de sus respuestas.

---

## 2. Responsabilidad principal del agente MCP-SERVER

El agente `MCP-SERVER` debe encargarse de:

- mejorar herramientas MCP del gateway,
- endurecer contratos de salida,
- reducir ambiguedad en errores y mensajes,
- facilitar consumo por automatizacion,
- optimizar tools pesadas como `semgrep_scan`,
- mantener compatibilidad con clientes existentes.

---

## 3. Problemas que el agente MCP-SERVER debe resolver

### 3.1 `semgrep_scan` tiene baja observabilidad

#### Problema
Aunque `semgrep` esta instalado y funciona en la instancia, la tool actual no expresa con suficiente claridad:

- cuando no hay findings,
- cuando hay timeout,
- cuando el scan es demasiado grande,
- cuando el problema viene de config o de la registry,
- cuanto tiempo tomo la ejecucion.

#### Impacto
Desde `n8n`, el resultado puede parecer ambiguo o poco util.

### 3.2 `semgrep_scan` no esta optimizado para flujos automatizados

#### Problema
La tool actual:

- solo acepta directorios,
- tiene timeout fijo de 120s,
- no expone metadatos suficientes,
- no facilita un parseo estructurado consistente para automatizacion.

#### Impacto
Su integracion con workflows es mas fragil de lo necesario.

### 3.3 Falta un contrato mas fuerte para tools pesadas

#### Problema
`search_docs` y `analize_code` ya aportan bastante contexto, pero `semgrep_scan` y `tree_sitter_parse` no estan tan orientadas a ser consumidas por pipelines automáticos comparables.

#### Impacto
El workflow debe compensar demasiada logica del lado `n8n`.

### 3.4 Falta ayuda para reduccion de candidatos desde el lado servidor

#### Problema
Actualmente el workflow depende de parsear texto de tools para decidir archivos candidatos.

#### Impacto
La seleccion de paths queda demasiado del lado cliente.

### 3.5 Falta consistencia de mensajes tecnicos orientados a automatizacion

#### Problema
Algunas tools estan pensadas para lectura humana, pero no siempre dejan un contrato estable de maquina facil de consumir en pipelines.

#### Impacto
Mayor trabajo de parsing en `n8n` y mayor fragilidad ante cambios futuros.

---

## 4. Plan por fases del lado MCP-SERVER

## Fase A - Mejorar `semgrep_scan`

### Objetivo
Convertir `semgrep_scan` en una tool mas predecible y mas usable para automatizacion.

### Cambios requeridos

#### 1. Mejorar el mensaje de salida
La tool debe distinguir explicitamente entre estos casos:

- scan completado sin findings,
- scan completado con findings,
- timeout,
- path invalido,
- error de configuracion,
- error del binario,
- error de descarga de reglas/registry.

#### 2. Agregar metadatos de ejecucion
La salida deberia incluir al menos:

- `target`
- `config`
- `format`
- `elapsed_ms`
- `timed_out`
- `findings_count`
- `exit_code`

#### 3. Hacer timeout configurable
Permitir un parametro opcional, por ejemplo `timeout_ms`, con limites razonables.

#### 4. Permitir exclusiones opcionales
Evaluar soporte para argumentos opcionales como:

- `include`
- `exclude`
- `max_target_bytes`

Si Semgrep CLI lo soporta de forma segura para el caso, exponerlo con validacion.

#### 5. Mejorar salida para `format=json`
Cuando `format=json`, devolver texto con resumen humano y un bloque estructurado o facilmente parseable.

### Resultado esperado
`semgrep_scan` debe pasar de ser una tool de uso manual a una tool amigable para pipeline.

## Fase B - Mejorar `tree_sitter_parse`

### Objetivo
Hacerla mas util para workflows automáticos.

### Cambios requeridos

#### 1. Evaluar resumen estructurado opcional
Agregar un modo opcional que devuelva, ademas del AST crudo:

- lenguaje detectado,
- numero de nodos,
- funciones encontradas,
- clases o structs detectados,
- nombres de simbolos clave.

#### 2. Evitar respuestas excesivamente grandes
Evaluar si conviene:

- limitar el AST,
- resumir si supera cierto tamano,
- agregar bandera de truncamiento.

### Resultado esperado
Menor costo de parseo del lado `n8n` y mas utilidad directa para ranking de candidatos.

## Fase C - Endurecer contratos de tools para automatizacion

### Objetivo
Reducir parsing heuristico del lado cliente.

### Cambios requeridos

#### 1. Revisar `search_docs`
Evaluar si conviene ofrecer una variante o salida con:

- lista de documentos relevantes,
- paths detectados,
- score normalizado,
- resumen corto.

#### 2. Revisar `analize_code`
Evaluar si conviene enriquecer salida con:

- archivos sugeridos,
- modulos candidatos,
- confidence,
- evidencias agrupadas.

#### 3. Mantener compatibilidad
Si se agregan envelopes o bloques estructurados, hacerlo de manera backward compatible, igual que Azure v2.

## Fase D - Crear soporte a ranking de candidatos

### Objetivo
Delegar parte de la deteccion de archivos relevantes al servidor.

### Opciones

#### Opcion 1: enriquecer tools existentes
Agregar a `search_docs` y/o `analize_code` una seccion estructurada con archivos candidatos.

#### Opcion 2: crear una tool nueva
Evaluar una tool nueva, por ejemplo:

- `rank_candidate_files`
- `suggest_code_paths`

Esta tool podria recibir una descripcion de bug y devolver:

- `candidate_files`
- `candidate_dirs`
- `top_symbols`
- `confidence`

### Resultado esperado
Menos heuristica del lado `n8n`, mas coherencia entre clientes.

## Fase E - Mejorar observabilidad del gateway para herramientas usadas por n8n

### Objetivo
Facilitar diagnostico de llamadas remotas.

### Cambios requeridos

#### 1. Log estructurado por tool call
Agregar o reforzar logs con:

- tool name,
- args relevantes,
- elapsed time,
- status,
- error code,
- session id,
- user id.

#### 2. Identificacion clara de timeout y truncamiento
Registrar explicitamente cuando una tool:

- excedio tiempo,
- devolvio salida truncada,
- fue cancelada,
- devolvio cero resultados.

### Resultado esperado
Mejor troubleshooting desde logs y menor ambiguedad en produccion.

---

## 5. Reglas operativas para el agente MCP-SERVER

### 5.1 Regla de compatibilidad

Todo cambio de contratos debe intentar ser backward compatible.

### 5.2 Regla de automatizacion primero

Las tools no solo deben verse bien para humanos; tambien deben ser predecibles para clientes como `n8n`.

### 5.3 Regla de errores claros

Cada tool critica debe diferenciar:

- error de entrada,
- error de sistema,
- timeout,
- resultado vacio,
- resultado truncado.

### 5.4 Regla de alcance controlado

Las tools costosas deben favorecer paths pequenos y seguros; si el path es demasiado amplio, conviene responder con advertencia clara.

---

## 6. Entregables esperados del agente MCP-SERVER

El agente `MCP-SERVER` debe entregar:

1. mejoras en `gateway/src/semgrep-tool.ts`,
2. posibles mejoras en `tree-sitter-tool.ts`,
3. contratos mas claros en tools relevantes,
4. mejores mensajes de error y metadatos,
5. mejor observabilidad del uso remoto desde `n8n`.

---

## 7. Checklist de validacion del lado MCP-SERVER

- [ ] `semgrep_scan` distingue sin findings vs timeout vs error real.
- [ ] `semgrep_scan` reporta `elapsed_ms` y `findings_count`.
- [ ] `semgrep_scan` permite configuracion mas controlada para pipelines.
- [ ] `tree_sitter_parse` se puede consumir mejor desde automatizacion.
- [ ] `search_docs` y `analize_code` ofrecen mejor soporte para paths candidatos, o existe una tool nueva para ello.
- [ ] Los logs del gateway permiten diagnosticar fallos de tools usadas por `n8n`.

---

## 8. Resumen ejecutivo

El agente `MCP-SERVER` debe enfocarse en endurecer el servidor y sus tools para consumo automatizado. No debe resolver la orquestacion del workflow, pero si debe facilitarla con contratos mas claros, mejores errores y mejor observabilidad.

Su meta principal es convertir al gateway en una base mas estable para clientes cooperantes como el proyecto `n8n`.
