# Comandos útiles – Instancia EC2 (MCP Knowledge Hub)

Comandos para conectarte a la instancia, ver logs y arrancar/parar servicios manualmente.

---

## 1. Conectar a la instancia

**Desde tu máquina (PowerShell), en la raíz del repo:**

```powershell
cd C:\PROYECTOS\MCP-SERVER
ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181
```

La primera vez puede pedirte aceptar la huella: escribe `yes`.

**Desde Git Bash o WSL:**

```bash
cd /c/PROYECTOS/MCP-SERVER
ssh -i infra/mcp-server-key.pem ec2-user@52.91.217.181
```

---

## 1b. Conectar Cursor IDE al servidor remoto (Remote SSH)

Para abrir el proyecto de la instancia en Cursor y trabajar como si fuera local (terminal, archivos, extensiones en el remoto):

**1. Configurar SSH en tu máquina**

En Windows, crea o edita el archivo de configuración SSH. Suele estar en:

- `C:\Users\<tu_usuario>\.ssh\config`

Añade un bloque como este (ajusta la ruta de la clave si no es la misma):

```
Host mcp-ec2
  HostName 52.91.217.181
  User ec2-user
  IdentityFile C:\PROYECTOS\MCP-SERVER\infra\mcp-server-key.pem
  ServerAliveInterval 60
  ServerAliveCountMax 3
```

`ServerAliveInterval 60` envía un keepalive cada 60 segundos para que la sesión no se cierre por inactividad. `ServerAliveCountMax 3` permite 3 respuestas perdidas antes de dar la conexión por cerrada.

**2. Conectar desde Cursor**

- Pulsa `Ctrl+Shift+P` (o `F1`) y escribe **Remote-SSH: Connect to Host**.
- Elige el host **mcp-ec2** (o el nombre que hayas puesto en `Host`).
- La primera vez Cursor instalará su servidor en la instancia (descarga por HTTPS); hace falta que la instancia tenga salida a internet.
- Cuando termine, se abrirá una ventana conectada al remoto. Abre la carpeta del proyecto: `/home/ec2-user/MCP-SERVER` (o `~/MCP-SERVER`).

**3. Qué tienes al conectar**

- Explorador de archivos del remoto, terminal integrado en la instancia, extensiones que se ejecuten en el remoto.
- El código y los contenedores (Docker) están en la instancia; puedes editar y ejecutar `docker compose` desde la terminal de Cursor.

**4. Si algo falla**

- Comprueba que desde PowerShell puedes conectar: `ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181`.
- Si la clave está en una ruta con espacios, en `config` usa comillas: `IdentityFile "C:\ruta con espacios\mcp-server-key.pem"`.
- En EC2, el security group debe permitir SSH (22) desde tu IP.

---

## 1c. Ventana de inicio y búsqueda (webapp)

La **ventana de inicio / búsqueda** del MCP Knowledge Hub se abre en el navegador con esta URL (importante: **http**, sin **s**):

**http://mcp.domoticore.co**

El servidor solo expone HTTP (puerto 80), no HTTPS. Si pones `https://` el navegador no podrá conectar y no verás la pantalla.

- Escribe en la barra de direcciones: `http://mcp.domoticore.co` y pulsa Intro.
- Deberías ver la página con el título "MCP Knowledge Hub" y el cuadro de búsqueda.
- Si la página queda en blanco o no carga, comprueba que usas **http** y no https, y que en la instancia estén en marcha webapp y nginx: `docker compose ps webapp nginx`.

## 1d. Comprobar el gateway desde tu máquina

Health del gateway (ruta bajo `/api/`):

```powershell
Invoke-WebRequest -Uri "http://mcp.domoticore.co/api/health" -UseBasicParsing
```

En Git Bash o con curl: `curl http://mcp.domoticore.co/api/health`

Si obtienes **502 Bad Gateway**, en la instancia revisa logs del gateway y reinicia nginx: `docker compose logs gateway --tail=50` y `docker compose restart nginx`.

---

## 1d2. Conectar MCP local a Qdrant en la instancia (túnel SSH)

Para que tu **MCP local** (magaya, usar-mcp o el gateway en tu PC) use el **Qdrant que corre en Docker en la instancia**:

1. **Abre un túnel SSH** (deja la terminal abierta mientras uses el MCP local). Para que la sesión no se cierre por inactividad, usa **keepalives** (`ServerAliveInterval`):

   **PowerShell (en la raíz del repo):**
   ```powershell
   ssh -i "infra\mcp-server-key.pem" -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -L 6333:localhost:6333 ec2-user@52.91.217.181
   ```

   **Git Bash / WSL:**
   ```bash
   ssh -i infra/mcp-server-key.pem -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -L 6333:localhost:6333 ec2-user@52.91.217.181
   ```

   **Si tienes el host `mcp-ec2` en `~/.ssh/config`**, añade ahí `ServerAliveInterval 60` y `ServerAliveCountMax 3` (ver abajo); luego basta con:
   ```powershell
   ssh -L 6333:localhost:6333 mcp-ec2
   ```

   Con esto, en tu máquina **localhost:6333** se reenvía al puerto 6333 de la instancia (donde escucha Qdrant en Docker). Los keepalives evitan que la conexión se corte por inactividad.

2. **Configura el MCP con Qdrant en localhost**  
   En `.cursor/mcp.json` el servidor (magaya / usar-mcp) ya tiene `"QDRANT_URL": "http://localhost:6333"`. Con el túnel activo, ese `localhost:6333` es el Qdrant de la instancia.

3. **Arranca el MCP local** (Cursor usará magaya o usar-mcp). Las tools que usan Qdrant (search_docs, etc.) hablarán con el Qdrant remoto a través del túnel.

**Si corres el gateway en local** (no solo stdio): en `gateway/.env` pon `QDRANT_URL=http://localhost:6333` y ten el túnel abierto; el gateway usará el Qdrant de la instancia.

**Nota:** En la instancia, Qdrant está en Docker con `ports: "6333:6333"`, así que en la EC2 escucha en localhost:6333. El túnel -L 6333:localhost:6333 hace que tu PC vea ese puerto como su propio localhost:6333.

---

## 1d3. search_docs devuelve "Search failed: fetch failed"

La tool **search_docs** necesita que el gateway pueda conectar con **Qdrant**. El error "fetch failed" suele significar que no llega a Qdrant.

- **Si usas MCP local (magaya/usar-mcp) en tu PC:** el gateway corre en tu máquina y usa `QDRANT_URL` de `gateway/.env` (por defecto `http://localhost:6333`). Para que search_docs funcione:
  1. **Opción A:** Túnel SSH a la instancia (ver 1d2) y deja el túnel abierto. Con `QDRANT_URL=http://localhost:6333`, el gateway usará el Qdrant de la instancia.
  2. **Opción B:** Tener Qdrant corriendo en tu PC (por ejemplo con Docker) y apuntar `QDRANT_URL` a ese servicio.
- **Si usas MCP remoto (gateway en la instancia):** el gateway ya está en la EC2; `QDRANT_URL` suele ser `http://localhost:6333` o el nombre del contenedor. Comprueba que el contenedor `mcp-qdrant` esté Up y healthy (`docker compose ps`).

Tras cambiar `.env` o abrir el túnel, reinicia el proceso del MCP (reiniciar Cursor o recargar la ventana) para que cargue de nuevo las variables.

---

## 1d4. La webapp muestra "Azure DevOps no está configurado"

Si la herramienta MCP de Azure funciona pero la página `/azure-tasks` muestra ese error, normalmente es porque:

- El **MCP** (tools `azure_*`) carga variables desde **`gateway/.env`**.
- El **gateway en Docker** (llamado por la webapp vía `/api/azure/*`) carga variables desde **`.env`** (raíz del repo) y, en este proyecto, también desde **`gateway/.env`**.

**Solución (local):**

1. Asegúrate de tener en `gateway/.env`:
   - `AZURE_DEVOPS_BASE_URL`
   - `AZURE_DEVOPS_PROJECT`
   - `AZURE_DEVOPS_PAT`
2. Reinicia `gateway` y `nginx`:
   - `docker compose restart gateway nginx`

**Verificación rápida:**

- `http://localhost/api/azure/work-items?from=2026-02-01&to=2026-02-28`

Si devuelve JSON con `items`, la webapp ya podrá listar tareas.

## 1e. Cursor no conecta: "Maximum sessions per user (3) reached"

Si en Cursor el MCP remoto falla con ese mensaje, en la **EC2** haz una de estas dos cosas:

**Opción A – Subir el límite y reiniciar (recomendado)**

En la instancia:

```bash
cd ~/MCP-SERVER
# Añadir al .env del gateway (o al .env que use docker compose)
echo "MAX_SESSIONS_PER_USER=10" >> .env
docker compose restart gateway
```

**Opción B – Solo reiniciar (vacía sesiones en memoria)**

```bash
cd ~/MCP-SERVER
docker compose restart gateway
```

Tras el reinicio, en Cursor recarga el MCP o reconecta el servidor "knowledge-hub-remote".

---

## 2. Logs de servicios

**Todos los servicios (últimas líneas):**

```bash
cd ~/MCP-SERVER
docker compose logs --tail=100
```

**Seguir logs en vivo (todos):**

```bash
docker compose logs -f
```

**Logs de un servicio concreto:**

```bash
# Gateway (API MCP, búsqueda, health)
docker compose logs -f gateway

# Supervisor (indexación inbox + SHARED_DIRS)
docker compose logs -f supervisor

# Qdrant (base vectorial)
docker compose logs -f qdrant

# Nginx (proxy HTTP)
docker compose logs -f nginx

# Postgres, Redis, InfluxDB, Grafana, Webapp
docker compose logs -f postgres
docker compose logs -f redis
docker compose logs -f influxdb
docker compose logs -f grafana
docker compose logs -f webapp
```

**Últimas N líneas de un servicio:**

```bash
docker compose logs --tail=200 gateway
docker compose logs --tail=200 supervisor
```

**Log del ciclo de indexación one-shot (si lo lanzaste con nohup):**

```bash
tail -f ~/index-cycle.log
```

---

## 3. Arrancar y parar servicios

**Arrancar todo (en segundo plano):**

```bash
cd ~/MCP-SERVER
docker compose up -d
```

**Parar todo:**

```bash
docker compose down
```

**Parar todo y borrar volúmenes (¡cuidado!: borra datos de Qdrant, Postgres, etc.):**

```bash
docker compose down -v
```

**Reiniciar un servicio:**

```bash
docker compose restart gateway
docker compose restart supervisor
docker compose restart nginx
```

**Arrancar solo algunos servicios:**

```bash
docker compose up -d qdrant influxdb gateway nginx
```

**Parar un servicio concreto:**

```bash
docker compose stop supervisor
docker compose stop gateway
```

**Volver a arrancar un servicio parado:**

```bash
docker compose start supervisor
docker compose start gateway
```

**Estado de los contenedores:**

```bash
docker compose ps
# o más detalle
docker ps -a
```

---

## 4. Indexación y Qdrant

**Pruebas repetibles:** Ver [docs/PRUEBAS-INDEXACION-ONE-TIME.md](PRUEBAS-INDEXACION-ONE-TIME.md) para testear que classic/blueivory no se reindexan y comandos desde instancia o desde la máquina local.

**Contar documentos (puntos) indexados en Qdrant**

*Desde la instancia (SSH):*

```bash
# Respuesta completa (incluye points_count)
curl -s http://localhost:6333/collections/mcp_docs | grep points_count

# Solo el número (points_count)
curl -s http://localhost:6333/collections/mcp_docs | grep -o '"points_count":[0-9]*'
```

*Desde Cursor / MCP (herramienta del gateway):*

Con el servidor MCP del gateway configurado en Cursor, puedes pedir que cuente documentos y se usará la herramienta `count_docs`:

- Escribe en el chat: **"cuenta los documentos indexados"** o **"¿cuántos documentos hay en Qdrant?"**
- O invoca la herramienta por nombre: **count_docs** (sin argumentos).

El gateway devuelve: colección (`mcp_docs`) y total de documentos indexados.

**Qué significa la salida de `curl ... | grep points_count`**

- **points_count:** Número de puntos (chunks) en la colección. Cada archivo puede generar varios puntos si se parte en trozos. Ese es el “total de registros” en Qdrant.
- **vectors_count / indexed_vectors_count:** Vectores indexados (similar a points_count; puede haber un pequeño retraso mientras se indexan).
- **status: green:** La colección está operativa.

Si el número **sube** (ej. de 65k a 93k), suele ser porque se están **añadiendo archivos nuevos** (p. ej. el primer ciclo completo de blueivory), no porque se esté reindexando lo mismo. El indexador **no vuelve a enviar a la API** archivos que ya están en el índice.

**Por qué no reindexamos lo mismo (y no gastamos de más en la API)**

1. **Claves ya indexadas:** Al empezar cada ciclo se cargan de Qdrant (o del SQLite persistente) todas las claves `(proyecto, ruta)` ya indexadas. Solo se envían a embeddings los archivos cuya clave **no** está en ese conjunto (archivos nuevos).
2. **One-time (classic / blueivory):** Si un proyecto está en `SHARED_DIRS_ONCE` y ya está en la tabla SQLite `data/one_time_indexed.db`, ese proyecto **no se procesa** en ciclos siguientes: no se lee la carpeta ni se llama a la API.
3. **Reindexar solo si cambió:** Solo si activas `INDEX_SHARED_REINDEX_CHANGED=true` se reindexan archivos cuyo **contenido** cambió (por hash). Por defecto no está activado.

Así, el crecimiento del consumo de la API coincide con **contenido nuevo** (p. ej. blueivory la primera vez), no con repetir los mismos archivos una y otra vez.

**Lanzar un ciclo de indexación one-shot (inbox + SHARED_DIRS) y seguir el log:**

```bash
cd ~/MCP-SERVER
nohup docker compose run --rm supervisor node dist/supervisor.js --once > ~/index-cycle.log 2>&1 &
tail -f ~/index-cycle.log
```

**Matar un ciclo de indexación en curso (por proceso):**

```bash
pkill -f "supervisor.js"
```

**Saber si el ciclo de indexación terminó bien:**

- **Terminó bien:** en el log debe aparecer `indexSharedDirs completed` y, si indexaste classic y blueivory en one-shot, también `indexSharedDirs one-time complete` para ambos proyectos.
- **Terminó mal:** si aparece `Error fatal` en el log, el proceso se detuvo por error (p. ej. límite de tokens o rate limit tras todos los reintentos).

Comandos para comprobarlo (desde la instancia):

```bash
# ¿Terminó bien? (debe mostrar líneas con "indexSharedDirs completed" y "one-time complete")
grep -E "indexSharedDirs completed|one-time complete" ~/index-cycle.log

# ¿Hubo error fatal?
grep "Error fatal" ~/index-cycle.log
```

Si **no** ves `indexSharedDirs completed` y el contenedor del ciclo ya no está en ejecución, revisa si hubo error:

```bash
grep -E "Error fatal|Embedding batch failed" ~/index-cycle.log
```

Si solo ves muchos `Embedding batch retry` (429 rate limit), el proceso **sigue en curso** o está esperando 90 s entre reintentos; no ha terminado ni fallado aún. Cuando termine bien, al final del log verás algo como:

```text
{"ts":"...","level":"info","message":"indexSharedDirs one-time complete","project":"blueivory"}
{"ts":"...","level":"info","message":"indexSharedDirs completed","indexed":...,"newCount":...,"reindexedCount":...,"errors":0}
```

---

## 5. Servicios y puertos

| Servicio   | Contenedor    | Puerto (host) | Uso                    |
|-----------|----------------|---------------|------------------------|
| nginx     | mcp-nginx      | 80            | HTTP (API, webapp)     |
| gateway   | mcp-gateway    | (interno 3001)| API MCP, búsqueda      |
| webapp    | mcp-webapp     | (interno 3000)| App Next.js            |
| qdrant    | mcp-qdrant     | 6333          | Base vectorial         |
| postgres  | mcp-postgres   | 5432          | Base de datos          |
| redis     | mcp-redis      | 6379          | Cola (worker)          |
| influxdb   | mcp-influxdb   | 8086          | Métricas               |
| grafana   | mcp-grafana    | 3002          | Dashboards             |
| supervisor| mcp-supervisor | —             | Indexación periódica   |

---

## 6. Rebuild y despliegue de código

**Reconstruir imágenes y arrancar (tras subir cambios al repo en la instancia):**

```bash
cd ~/MCP-SERVER
docker compose build gateway supervisor
docker compose up -d gateway supervisor
```

**Ver variables de entorno (ej. SHARED_DIRS, OPENAI):**

```bash
cat ~/MCP-SERVER/.env
```

Editar `.env` en la instancia y luego reiniciar los servicios que lo usen (gateway, supervisor).

**Herramientas ClickUp (MCP):** Para usar las herramientas ClickUp desde el MCP en la instancia, añade en `~/MCP-SERVER/.env` (o donde se cargue el env del gateway): `CLICKUP_API_TOKEN=pk_...` (Personal API Token de ClickUp: Settings → Apps → API Token). Luego reinicia el gateway: `docker compose restart gateway`.

---

## 7. Util scripts (update-repo, etc.)

Scripts de utilidad instalados **fuera del proyecto** en `/opt/mcp-tools`, disponibles como comandos del sistema (sin `source` ni rutas).

**Comandos disponibles tras instalar:**

| Comando | Descripción |
|---------|-------------|
| `util_update_repo` | Pull del repo, build gateway/supervisor, reinicio de servicios |
| `update-repo` / `actualizar-repo` | Igual (vía symlink) |
| `update repo` / `actualizar repo` | Igual (vía alias; requiere sesión con profile cargado) |
| `util_health_check_restart` | Comprueba `/api/health`; si devuelve 502, reinicia nginx (uso: producción) |

**Instalación (una vez en la instancia):**

Tras un clone o pull del repo, ejecutar:

```bash
cd ~/MCP-SERVER
sudo bash scripts/ec2/install-tools.sh
```

Luego cerrar y reabrir la sesión SSH (o `source /etc/profile.d/mcp-tools.sh`) para que el PATH y los aliases con espacio estén disponibles.

**Qué hace el instalador:**

- Crea `/opt/mcp-tools` y copia los scripts desde `~/MCP-SERVER/scripts/ec2/`.
- Añade `/opt/mcp-tools` al PATH vía `/etc/profile.d/mcp-tools.sh`.
- Crea los symlinks `update-repo` y `actualizar-repo` y los aliases `"update repo"` y `"actualizar repo"`.

**Tools de instancia desde Cursor:**  
- **`instance_update`:** hace add/commit/push local y devuelve el comando SSH que ejecuta `scripts/ec2/instance_update_with_verify.sh`: pull, build, restart, verifica health (hasta 3 intentos); si falla, revierte (`git reset --hard`) y guarda estado en `.last-update-status` (archivo de texto).
- **`instance_report`:** devuelve el comando SSH para ver estado en Markdown: Current IP, última actualización, estado (archivo `.last-update-status`), contenedores, health.
- **`instance_reboot`:** devuelve el comando SSH para reiniciar todos los servicios (`docker compose restart`).

Host y clave por defecto: `ec2-user@52.91.217.181`, `infra/mcp-server-key.pem`. Ejecuta el comando en la terminal de Cursor (o pide a Cursor que lo ejecute). **Si usas el MCP remoto:** ejecuta en la terminal de tu PC (desde la raíz del repo) o en una terminal ya conectada por SSH. Si las tools no aparecen, actualiza la instancia y reconecta Cursor al MCP.

---

## 8. Producción: mitigar 502 cuando nginx pierde conexión con el gateway

Si Cursor deja de conectar (502 Bad Gateway) tras reinicios del gateway o cortes de red entre contenedores:

**A) Cambios ya en el repo (nginx + docker-compose):**

- Nginx re-resuelve `gateway` con el DNS de Docker (`resolver 127.0.0.11`) para evitar IP obsoletas tras reinicios.
- `restart: always` en gateway y nginx.
- Nginx espera a que el gateway esté healthy antes de arrancar (`depends_on` con `condition: service_healthy`).

**B) Health check automático (cron cada 5 min):**

```bash
# En la instancia, tras instalar util scripts:
(crontab -l 2>/dev/null | grep -v util_health_check_restart; echo "*/5 * * * * /opt/mcp-tools/util_health_check_restart >> /var/log/mcp-health.log 2>&1") | crontab -
```

Si `/api/health` devuelve 502 o falla, el script reinicia nginx. Opción `--gateway` para reiniciar también el gateway:

```bash
/opt/mcp-tools/util_health_check_restart --gateway
```
