# Uso de los scripts ClickUp: crear y finalizar tareas y subtareas

Este documento explica cómo usar los scripts del gateway para crear tareas y subtareas en ClickUp y cómo marcarlas como finalizadas. Los comandos se ejecutan **desde la carpeta `gateway/`** del proyecto.

---

## Requisitos

1. **Token de API**  
   En `gateway/.env` debe estar definido:
   ```env
   CLICKUP_API_TOKEN=pk_...
   ```
   (Personal API Token desde ClickUp: Settings → Apps → API Token.)

2. **Opcionales en `.env`**
   - `LIST_ID`: ID de la lista donde crear tareas (si no está, se usa la primera lista del workspace que contenga "MCP-SERVER" en el nombre).
   - `ASSIGNEE_USER_ID`: ID del usuario asignado por defecto (si no está, se usa el usuario del token).

3. **Build del gateway**  
   Los scripts usan `dist/clickup-client.js`. Si acabas de clonar o cambiar código:
   ```bash
   cd gateway
   npm run build
   ```

4. **Comprobar el token (opcional)**  
   Si obtienes 401 al crear tareas, verifica que el token sea válido:
   ```bash
   node scripts/clickup/verify-clickup-token.cjs
   ```
   Si falla, genera un nuevo token en ClickUp (Settings → Apps → API Token) y actualiza `CLICKUP_API_TOKEN` en `.env`.

---

## Crear tareas: script genérico

El script **`create-clickup-task.cjs`** sirve para crear **una tarea** y, si quieres, **sus subtareas** en una sola ejecución. No hace falta escribir un script nuevo por cada caso.

### Uso básico

```bash
cd gateway
node scripts/clickup/create-clickup-task.cjs --title "Título de la tarea"
```

Crea una tarea con ese título en la lista por defecto (o la de `LIST_ID`), asignada al usuario por defecto.

### Descripción

- **Texto plano**
  ```bash
  node scripts/clickup/create-clickup-task.cjs --title "Mi tarea" --description "Descripción en texto plano."
  ```
- **Desde archivo (texto plano)**
  ```bash
  node scripts/clickup/create-clickup-task.cjs --title "Mi tarea" --description-file docs/mi-descripcion.txt
  ```
- **Markdown** (ClickUp la renderiza con títulos, listas, código, etc.)
  ```bash
  node scripts/clickup/create-clickup-task.cjs --title "Mi tarea" --markdown "## Objetivo\nImplementar X."
  ```
- **Markdown desde archivo**
  ```bash
  node scripts/clickup/create-clickup-task.cjs --title "Mi tarea" --markdown-file docs/mi-tarea.md
  ```

### Tarea con subtareas

Puedes crear la tarea y sus subtareas en un solo comando:

- **Varias subtareas separadas por comas**
  ```bash
  node scripts/clickup/create-clickup-task.cjs --title "Módulo X" --subtasks "Diseño,Implementación,Tests,Documentación"
  ```
- **Subtareas desde un archivo** (una por línea)
  ```bash
  node scripts/clickup/create-clickup-task.cjs --title "Módulo X" --subtasks-file docs/subtareas-modulo-x.txt
  ```
  Ejemplo de `docs/subtareas-modulo-x.txt`:
  ```
  1. Especificación y diseño
  2. Implementación
  3. Tests
  4. Documentación e integración
  ```

### Opciones adicionales

| Opción | Descripción |
|--------|-------------|
| `--list-id id` | Lista ClickUp donde crear (si no usas `LIST_ID` en .env). |
| `--assignee id` | User ID asignado a la tarea y subtareas. |
| `--priority 1\|2\|3\|4` | 1=urgent, 2=high, 3=normal, 4=low. |
| `--status "nombre"` | Estado inicial (debe existir en la lista). |

Ejemplo combinado:

```bash
node scripts/clickup/create-clickup-task.cjs --title "Feature Y" --markdown-file docs/feature-y.md --subtasks "Backend,Frontend,QA" --priority 2 --list-id 901325668563
```

---

## Crear varias tareas con el script genérico

Para **varias tareas independientes** (cada una con su propio título y opciones), se ejecuta el script genérico **una vez por tarea**. Puedes hacerlo manualmente o con un pequeño script en tu shell.

### Ejecuciones manuales

```bash
cd gateway

node scripts/clickup/create-clickup-task.cjs --title "Tarea A" --description "Descripción A"
node scripts/clickup/create-clickup-task.cjs --title "Tarea B" --subtasks "Sub B1,Sub B2"
node scripts/clickup/create-clickup-task.cjs --title "Tarea C" --markdown-file docs/tarea-c.md
```

### Varias tareas desde un script (PowerShell)

Si tienes una lista de títulos (o títulos + descripción), puedes recorrerla y llamar al script genérico:

```powershell
# Ejemplo: crear 3 tareas desde una lista de títulos
cd gateway
$titulos = @("Sprint 1: Diseño", "Sprint 2: Desarrollo", "Sprint 3: Cierre")
foreach ($t in $titulos) {
  node scripts/clickup/create-clickup-task.cjs --title $t
}
```

### Varias tareas desde un archivo de títulos

Archivo `docs/titulos-tareas.txt` (un título por línea):

```
Tarea 1: Revisar requisitos
Tarea 2: Implementar API
Tarea 3: Escribir tests
```

PowerShell (ejemplo):

```powershell
cd gateway
Get-Content docs/titulos-tareas.txt | ForEach-Object {
  node scripts/clickup/create-clickup-task.cjs --title $_
}
```

Bash (ejemplo, en Linux/macOS o Git Bash):

```bash
cd gateway
while IFS= read -r titulo; do
  node scripts/clickup/create-clickup-task.cjs --title "$titulo"
done < docs/titulos-tareas.txt
```

Así reutilizas el **mismo script genérico** para muchas tareas sin crear un script `.cjs` nuevo para cada lote.

---

## Añadir subtareas a una tarea ya existente

Si la tarea **ya está creada** y solo quieres añadir (o ampliar) subtareas, usa **`create-clickup-subtask.cjs`**.

Necesitas el **ID de la tarea padre** (lo ves en la URL de la tarea en ClickUp, por ejemplo `https://app.clickup.com/t/86afm198y` → el ID es `86afm198y`).

### Una subtarea

```bash
node scripts/clickup/create-clickup-subtask.cjs --parent-id 86afm198y --title "Nueva subtarea"
```

### Varias subtareas (comas o archivo)

```bash
node scripts/clickup/create-clickup-subtask.cjs --parent-id 86afm198y --titles "Subtarea 1,Subtarea 2,Subtarea 3"
```

```bash
node scripts/clickup/create-clickup-subtask.cjs --parent-id 86afm198y --titles-file docs/subtareas.txt
```

Si la tarea está en **otra lista** (no la de `LIST_ID` en .env), indica la lista:

```bash
node scripts/clickup/create-clickup-subtask.cjs --parent-id 86afm198y --list-id 901325668563 --title "Nueva subtarea"
```

### Caso concreto: tarea "Módulo HTTP SSE" y 24 subtareas

El script **`seed-subtasks-http-streamable.cjs`** crea la tarea contenedora **"Desarrollo: Módulo HTTP SSE"** y sus **24 subtareas** (con descripción en Markdown y estado completado). Usa el mismo patrón de carga de `.env` que los scripts genéricos (`create-clickup-task.cjs`, `create-clickup-subtask.cjs`).

#### Uso

| Modo | Comando | Qué hace |
|------|--------|----------|
| Crear tarea + subtareas | `node scripts/clickup/seeds/seed-subtasks-http-streamable.cjs` | Crea la tarea padre "Desarrollo: Módulo HTTP SSE" en la lista por defecto y las 24 subtareas debajo. |
| En otra lista | `node scripts/clickup/seeds/seed-subtasks-http-streamable.cjs --list-id <list_id>` | Igual, pero en la lista indicada. |
| Añadir a tarea existente | `node scripts/clickup/seeds/seed-subtasks-http-streamable.cjs --parent-id <task_id>` | No crea tarea padre; añade las 24 subtareas a la tarea ya existente. |
| Tarea existente en otra lista | `node scripts/clickup/seeds/seed-subtasks-http-streamable.cjs --parent-id <task_id> --list-id <list_id>` | Añade las 24 subtareas a la tarea existente; la tarea debe estar en esa lista. |
| Finalizar subtareas existentes | `node scripts/clickup/seeds/finish-http-sse-subtasks.cjs --task-id <task_id>` | No crea nada; actualiza las subtareas ya existentes con descripción y estado completado. Ver § "Finalizar solo las subtareas existentes (Módulo HTTP SSE)". |

#### Ejemplos

```bash
cd gateway

# Crear tarea "Módulo HTTP SSE" y las 24 subtareas (lista por defecto o LIST_ID en .env)
node scripts/clickup/seeds/seed-subtasks-http-streamable.cjs

# Crear en una lista concreta
node scripts/clickup/seeds/seed-subtasks-http-streamable.cjs --list-id 901325668563

# Añadir las 24 subtareas a una tarea ya creada (ID desde la URL en ClickUp)
node scripts/clickup/seeds/seed-subtasks-http-streamable.cjs --parent-id 86afm65jy
```

```bash
cd gateway

# Crear tarea "Módulo HTTP SSE" y las 24 subtareas (lista por defecto o LIST_ID en .env)
node scripts/clickup/seeds/seed-subtasks-http-streamable.cjs

# Crear en una lista concreta
node scripts/clickup/seeds/seed-subtasks-http-streamable.cjs --list-id 901325668563

# Añadir las 24 subtareas a una tarea ya creada (ID desde la URL en ClickUp)
node scripts/clickup/seeds/seed-subtasks-http-streamable.cjs --parent-id 86afm65jy
```

#### Lista por defecto

La lista se resuelve igual que en `create-clickup-subtask.cjs`: primero `--list-id`, luego `LIST_ID` en `.env`, y si no hay ninguno, la primera lista del workspace (MCP-SERVER). Si la tarea padre existe pero está en **otra** lista, hay que pasar `--list-id` con el id de esa lista; si no, ClickUp devuelve 400 "Parent not child of list" y el script indica que pases `--list-id`.

#### Contenido de las subtareas

Las 24 subtareas tienen título y descripción en Markdown (qué hacer, listo, fecha de cierre). Tras crearlas, el script las marca en estado "completado" (según el nombre del estado en la lista). Para **otras tareas** y solo títulos de subtareas, usa **`create-clickup-subtask.cjs`** con `--titles` o `--titles-file`.

---

## Obtener tarea padre y subtareas

Para **pedir** (por API) la tarea padre y sus subtareas desde la consola, usa **`get-clickup-task-with-subtasks.cjs`**. El script usa la API de ClickUp con `include_subtasks=true` y muestra la tarea y la lista de subtareas (nombre y URL).

### Uso

```bash
cd gateway
node scripts/clickup/get-clickup-task-with-subtasks.cjs --task-id <task_id>
```

Sustituye `<task_id>` por el ID de la tarea padre (lo ves en la URL de la tarea en ClickUp, ej. `https://app.clickup.com/t/86afm65jy` → `86afm65jy`).

**Salida:** nombre y URL de la tarea padre, número de subtareas y lista numerada con nombre y enlace de cada subtarea.

### Salida en JSON

```bash
node scripts/clickup/get-clickup-task-with-subtasks.cjs --task-id 86afm65jy --json
```

Devuelve un objeto JSON con la tarea (id, name, list) y el array de subtareas.

---

## Finalizar solo las subtareas existentes (Módulo HTTP SSE)

Si ya creaste la tarea **"Desarrollo: Módulo HTTP SSE"** y sus subtareas (a mano o con `create-clickup-subtask.cjs` con títulos), pero **sin** las descripciones en Markdown ni el estado completado, usa **`finish-http-sse-subtasks.cjs`**. Este script:

- Obtiene la tarea padre con `include_subtasks: true`.
- Para cada subtarea existente (en el mismo orden), asigna la **descripción** correspondiente de las 24 definidas en el seed y la marca como **completada** (según el estado de la lista).
- **No crea** nuevas subtareas; solo actualiza las que ya existen.

### Uso

```bash
cd gateway
node scripts/clickup/seeds/finish-http-sse-subtasks.cjs --task-id 86afm65jy
```

Sustituye `86afm65jy` por el ID de tu tarea padre (desde la URL en ClickUp). Requiere `CLICKUP_API_TOKEN` en `gateway/.env` y que el gateway esté compilado (`npm run build`).

---

## Finalizar tareas

### Script específico: `clickup-tasks-to-finished.cjs`

Este script está pensado para un **conjunto fijo de 35 tareas** (nombres definidos dentro del script). Para cada una de esas tareas:

- Cambia el estado al de "completado" de la lista (por nombre en español/inglés).
- Pone prioridad alta y tiempo estimado (1 h).
- Crea un time entry de 1 h.
- Añade el tag configurado (por defecto `entregable`; opcional `CLICKUP_TAG` en .env).
- Enlaza cada tarea con la siguiente.

**Uso:**

```bash
cd gateway
node scripts/clickup/clickup-tasks-to-finished.cjs
```

Requisito: esas 35 tareas deben existir en la lista (por ejemplo creadas antes con `seed-clickup-tasks.cjs`). Si quieres usar otro tag, en `.env`:

```env
CLICKUP_TAG=mi-tag
```

### Finalizar tareas arbitrarias (sin script específico)

Para **otras tareas** (las que creas con el script genérico o a mano):

- **Desde la interfaz de ClickUp:** cambiar estado a "completado" (o el que use tu lista).
- **Desde el agente MCP:** usar la herramienta **`clickup_update_task`** con `task_id` y `status` igual al nombre del estado de completado en tu lista (por ejemplo `"completado"` o `"done"`).

No hay un script genérico de consola que reciba una lista de IDs y las marque todas como completadas; ese flujo se cubre con el script de las 35 tareas o con la herramienta MCP.

---

## Resumen de scripts

| Script | Propósito |
|--------|-----------|
| `create-clickup-task.cjs` | **Genérico.** Crear una tarea (y opcionalmente sus subtareas). |
| `create-clickup-subtask.cjs` | **Genérico.** Añadir una o varias subtareas a una tarea existente (por `parent-id`). |
| `verify-clickup-token.cjs` | Comprobar que `CLICKUP_API_TOKEN` en `.env` sea válido (GET /user). |
| `get-clickup-task-with-subtasks.cjs` | Obtener tarea padre y sus subtareas (API con `include_subtasks`). Ver § "Obtener tarea padre y subtareas". |
| `seed-subtasks-http-streamable.cjs` | **Específico.** Crear la tarea "Módulo HTTP SSE" y sus 24 subtareas, o añadir esas 24 subtareas a una tarea existente (con descripción y estado completado). Ver § "Caso concreto: tarea Módulo HTTP SSE". |
| `finish-http-sse-subtasks.cjs` | **Específico.** Finalizar solo las subtareas existentes de la tarea "Módulo HTTP SSE": añadir descripción en Markdown y marcar como completadas (sin crear nuevas subtareas). Ver § "Finalizar solo las subtareas existentes (Módulo HTTP SSE)". |
| `clickup-tasks-to-finished.cjs` | Marcar como completadas las 35 tareas fijas (estado, prioridad, tiempo, tag, enlaces). |
| `seed-clickup-tasks.cjs` | Crear el lote fijo de 35 tareas (uso puntual para ese proyecto). |
| `update-clickup-tasks-in-progress.cjs` | Poner esas 35 tareas en "en curso" y rellenar descripciones en Markdown. |

Para **crear y mantener tareas y subtareas en general**, usa `create-clickup-task.cjs` y `create-clickup-subtask.cjs`; para **varias tareas**, ejecuta el genérico tantas veces como necesites (a mano o desde un script de shell como en los ejemplos anteriores). Los scripts **específicos** (`seed-subtasks-http-streamable.cjs`, `seed-clickup-tasks.cjs`, etc.) cubren casos ya definidos; no hace falta reinventar scripts nuevos para esos lotes.

Referencia de la API y herramientas MCP: ver `docs/CLICKUP-API-REFERENCE.md` en la raíz del repo.
