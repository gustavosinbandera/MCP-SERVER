# Crash "Debug Assertion Failed" en hyperion.node

## Síntoma

```
Microsoft Visual C++ Runtime Library
Debug Assertion Failed!
Program: ...\node_modules\@magaya\hyperion-node\bin\ia32\hyperion.node
File: minkernel\crts\ucrt\src\appcrt\heap\debug_heap.cpp
Line: 996
Expression: _acrt_first_block == header
```

La app aborta al usar `dbx.using(...).iterate()`, `dbw.edit()` o `dbw.save()`, o al inspeccionar objetos COM/dbx en el depurador.

## Causa raíz

El addon `hyperion.node` fue compilado con un CRT (C Runtime) distinto al de Node.js:

- **Node.js** usa enlazado dinámico (`/MD` o `/MDd` en MSVC).
- Si **hyperion.node** usa enlazado estático (`/MT` o `/MTd`), cada módulo tiene su propio heap.
- Al asignar memoria en un heap y liberarla en otro, el CRT de depuración falla con `_acrt_first_block == header`.

Es un problema de compilación del addon; no se puede corregir solo con código JS.

## Opciones de mitigación

### 1. Ejecutar sin depurador

El depurador (VS Code F5) carga módulos adicionales y puede empeorar el conflicto de heaps.

- Usar **Ctrl+F5** (Run without Debugging) en lugar de F5.
- O ejecutar en terminal:
  ```powershell
  cd extensiones/extension-example
  node index.js --root /server --port 8000 --service-name extension-demo --connection-string=w19-dev21-v:6110
  ```
- O: `npm start`

### 2. Usar la versión de Node recomendada por Magaya

El addon se compila para versiones concretas de Node (p. ej. 8.11.1–20.3.0 según la doc). Usa la versión indicada para tu Magaya.

```powershell
node -v
```

### 3. Evitar la ruta que provoca el crash

Para `assign-forwarding-agent`:

- `?dryRun=1` – Solo valida bill y entidad; no llama a `edit`/`save`. Evita el crash.
- `?skipEntity=1` – Ejecuta `edit` y `save` sin asignar `Entity`; sirve para localizar dónde ocurre el crash.

### 4. Reportar a Magaya

Solicitar que `@magaya/hyperion-node` se compile con `/MD` (o `/MDd` en debug) para coincidir con Node.js y evitar heaps separados.

## Referencias

- [MSVC /MT vs /MD – Debug Assertion __acrt_first_block == header](https://github.com/rttrorg/rttr/issues/209)
- [Node.js native addons and CRT heaps on Windows](https://github.com/nodejs/node/issues/40926)
