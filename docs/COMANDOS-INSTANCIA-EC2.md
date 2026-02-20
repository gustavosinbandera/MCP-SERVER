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
```

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
