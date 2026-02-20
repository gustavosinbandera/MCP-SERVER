# Pruebas de indexación one-time (classic / blueivory)

Documentación de pruebas para validar que los proyectos one-time (classic, blueivory) no se reindexan y que el ciclo de indexación se comporta como se espera. Incluye comandos ejecutables **desde la consola de la instancia** o **desde la máquina local** (PowerShell).

---

## Prerrequisitos

- En la instancia: `SHARED_DIRS` con classic y blueivory (ej. `classic:/app/classic;blueivory:/app/blueivory`).
- `SHARED_DIRS_ONCE=classic;blueivory` en `.env`.
- Classic y blueivory ya indexados una vez (en `data/one_time_indexed_projects.txt` o en `data/one_time_indexed.db`).
- Servicios: Qdrant y dependencias levantadas (`docker compose up -d` o al menos qdrant + influxdb para el ciclo).

---

## Prueba 1: Verificar que classic y blueivory no se reindexan

Objetivo: al ejecutar un ciclo `--once`, no debe indexar ningún archivo de classic ni blueivory; debe aparecer `skippedOneTime` y `indexed: 0` en shared.

### Desde la instancia (SSH ya abierta)

```bash
cd ~/MCP-SERVER
docker compose run --rm supervisor node dist/supervisor.js --once 2>&1
```

**Resultado esperado:** En la salida debe aparecer:

- `"projects":[]` (no hay proyectos a indexar).
- `"skippedOneTime":["classic","blueivory"]`.
- `"indexSharedDirs skipping one-time-already-done","projects":["classic","blueivory"]`.
- `"indexSharedDirs completed","indexed":0,"newCount":0,"reindexedCount":0,"errors":0`.
- `Ciclo bajo demanda terminado.`

### Desde la máquina local (PowerShell)

Un solo comando que conecta por SSH y ejecuta el ciclo en la instancia:

```powershell
cd C:\PROYECTOS\MCP-SERVER
ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181 "cd ~/MCP-SERVER && docker compose run --rm supervisor node dist/supervisor.js --once 2>&1"
```

**Criterio de éxito:** La salida contiene las mismas líneas que arriba (skippedOneTime, indexed: 0, Ciclo terminado).

---

## Prueba 2: Verificar mensajes de fin en el log (ciclo one-shot)

Objetivo: comprobar en el log que un ciclo one-shot terminó bien (one-time complete para classic y blueivory, y `indexSharedDirs completed` sin error fatal).

### Desde la instancia

```bash
# ¿Terminó bien? (one-time complete + indexSharedDirs completed)
grep -E "indexSharedDirs completed|one-time complete" ~/index-cycle.log

# ¿Hubo error fatal?
grep "Error fatal" ~/index-cycle.log
```

**Resultado esperado:**  
- El primer `grep` muestra líneas con `one-time complete` para classic y blueivory y una con `indexSharedDirs completed`.  
- El segundo no debe mostrar nada nuevo (o solo un error antiguo de otra ejecución).

### Desde la máquina local

```powershell
ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181 "grep -E 'indexSharedDirs completed|one-time complete' ~/index-cycle.log"
ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181 "grep 'Error fatal' ~/index-cycle.log"
```

---

## Prueba 3: Contar documentos en Qdrant

Objetivo: comprobar que el número de puntos en la colección es el esperado (no baja si no se borra nada; puede subir solo si se indexa contenido nuevo, p. ej. inbox).

### Desde la instancia

```bash
curl -s http://localhost:6333/collections/mcp_docs | grep points_count
```

**Resultado esperado:** Una línea con `"points_count":NNNNN` (ej. 93109). Anotar el valor para comparar antes/después de pruebas.

### Desde la máquina local

```powershell
ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181 "curl -s http://localhost:6333/collections/mcp_docs" | findstr points_count
```

---

## Prueba 4: Verificar que la clave one-time está persistida (no reindexar)

Objetivo: confirmar que classic y blueivory están registrados como “ya indexados una vez”.

### Desde la instancia (archivo legacy .txt)

Si aún usas el archivo de texto:

```bash
cat ~/MCP-SERVER/gateway/data/one_time_indexed_projects.txt 2>/dev/null || docker run --rm -v mcp-server_gateway_data:/app/data alpine cat /app/data/one_time_indexed_projects.txt 2>/dev/null
```

**Resultado esperado:** Líneas con `classic` y `blueivory` (o solo si uno se indexó).

### Desde la instancia (SQLite, cuando esté desplegado)

```bash
docker run --rm -v mcp-server_gateway_data:/app/data -e ONE_TIME_INDEXED_DB=/app/data/one_time_indexed.db alpine sh -c "apk add sqlite >/dev/null && sqlite3 /app/data/one_time_indexed.db 'SELECT project FROM one_time_indexed;'" 2>/dev/null
```

O desde el gateway (si tienes acceso a la carpeta data en el host):

```bash
sqlite3 ~/MCP-SERVER/gateway/data/one_time_indexed.db "SELECT project FROM one_time_indexed;" 2>/dev/null
```

**Resultado esperado:** Filas `classic` y `blueivory`.

---

## Resumen rápido (copiar/pegar desde local)

```powershell
# Conectar a la instancia
ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181

# Una vez dentro:
cd ~/MCP-SERVER
docker compose run --rm supervisor node dist/supervisor.js --once 2>&1
grep -E "skippedOneTime|indexSharedDirs completed" 
curl -s http://localhost:6333/collections/mcp_docs | grep points_count
```

O todo en una sola llamada SSH desde local:

```powershell
ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181 "cd ~/MCP-SERVER && docker compose run --rm supervisor node dist/supervisor.js --once 2>&1"
```

Si la salida muestra `skippedOneTime: ["classic","blueivory"]` e `indexed: 0`, las pruebas de one-time se consideran correctas.
