# Useful commands – EC2 instance (MCP Knowledge Hub)

Commands to connect to the instance, view logs, and start/stop services manually.

---

## 1. Connect to the instance

**From your machine (PowerShell), at the repo root:**

```powershell
cd C:\PROYECTOS\MCP-SERVER
ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181
```

The first time it may ask you to accept the host fingerprint: type `yes`.

**From Git Bash or WSL:**

```bash
cd /c/PROYECTOS/MCP-SERVER
ssh -i infra/mcp-server-key.pem ec2-user@52.91.217.181
```

---

## 1b. Connect Cursor IDE to the remote server (Remote SSH)

To open the instance project in Cursor and work as if it were local (terminal, files, extensions running remotely):

**1. Configure SSH on your machine**

On Windows, create or edit the SSH config file. It’s usually located at:

- `C:\Users\<your_user>\.ssh\config`

Add a block like this (adjust the key path if it’s different):

```
Host mcp-ec2
  HostName 52.91.217.181
  User ec2-user
  IdentityFile C:\PROYECTOS\MCP-SERVER\infra\mcp-server-key.pem
  ServerAliveInterval 60
  ServerAliveCountMax 3
```

`ServerAliveInterval 60` sends a keepalive every 60 seconds so the session doesn’t close due to inactivity. `ServerAliveCountMax 3` allows 3 missed responses before considering the connection dead.

**2. Connect from Cursor**

- Press `Ctrl+Shift+P` (or `F1`) and type **Remote-SSH: Connect to Host**.
- Choose host **mcp-ec2** (or whatever name you used in `Host`).
- The first time, Cursor will install its server on the instance (download over HTTPS); the instance needs outbound internet access.
- When done, a remote-connected window opens. Open the project folder: `/home/ec2-user/MCP-SERVER` (or `~/MCP-SERVER`).

**3. What you get when connected**

- Remote file explorer, a terminal on the instance, and extensions running on the remote.
- The code and containers (Docker) live on the instance; you can edit and run `docker compose` from Cursor’s terminal.

**4. If something fails**

- Verify you can connect from PowerShell: `ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181`.
- If your key is in a path with spaces, use quotes in `config`: `IdentityFile "C:\path with spaces\mcp-server-key.pem"`.
- On EC2, the security group must allow SSH (22) from your IP.

---

## 1c. Home/search page (webapp)

The MCP Knowledge Hub **home/search** page opens in a browser at this URL (important: **http**, no **s**):

**http://mcp.domoticore.co**

The server only exposes HTTP (port 80), not HTTPS. If you use `https://`, the browser won’t connect and you won’t see the page.

- Type in the address bar: `http://mcp.domoticore.co` and press Enter.
- You should see the page titled “MCP Knowledge Hub” and the search box.
- If the page is blank or doesn’t load, confirm you’re using **http** (not https) and that `webapp` and `nginx` are running on the instance: `docker compose ps webapp nginx`.

## 1d. Check the gateway from your machine

Gateway health (path under `/api/`):

```powershell
Invoke-WebRequest -Uri "http://mcp.domoticore.co/api/health" -UseBasicParsing
```

In Git Bash or with curl: `curl http://mcp.domoticore.co/api/health`

If you get **502 Bad Gateway**, on the instance check gateway logs and restart nginx: `docker compose logs gateway --tail=50` and `docker compose restart nginx`.

---

## 1d2. Connect local MCP to Qdrant on the instance (SSH tunnel)

So your **local MCP** (magaya, usar-mcp, or the gateway on your PC) can use the **Qdrant running in Docker on the instance**:

1. **Open an SSH tunnel** (keep the terminal open while using local MCP). To prevent the session from closing due to inactivity, use **keepalives** (`ServerAliveInterval`):

   **PowerShell (at the repo root):**
   ```powershell
   ssh -i "infra\mcp-server-key.pem" -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -L 6333:localhost:6333 ec2-user@52.91.217.181
   ```

   **Git Bash / WSL:**
   ```bash
   ssh -i infra/mcp-server-key.pem -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -L 6333:localhost:6333 ec2-user@52.91.217.181
   ```

   **If you have the `mcp-ec2` host in `~/.ssh/config`**, add `ServerAliveInterval 60` and `ServerAliveCountMax 3` there (see above); then you can simply run:
   ```powershell
   ssh -L 6333:localhost:6333 mcp-ec2
   ```

   With this, your machine’s **localhost:6333** forwards to port 6333 on the instance (where Qdrant listens in Docker). Keepalives prevent disconnections due to inactivity.

2. **Configure MCP to use Qdrant on localhost**  
   In `.cursor/mcp.json`, the server (magaya / usar-mcp) already has `"QDRANT_URL": "http://localhost:6333"`. With the tunnel active, that `localhost:6333` points to the instance’s Qdrant.

3. **Start the local MCP** (Cursor will use magaya or usar-mcp). Tools that use Qdrant (`search_docs`, etc.) will talk to the remote Qdrant through the tunnel.

**If you run the gateway locally** (not just stdio): set `QDRANT_URL=http://localhost:6333` in `gateway/.env` and keep the tunnel open; the gateway will use the instance’s Qdrant.

**Note:** On the instance, Qdrant runs in Docker with `ports: "6333:6333"`, so it listens on EC2 localhost:6333. The `-L 6333:localhost:6333` tunnel makes your PC see that port as its own localhost:6333.

---

## 1d3. `search_docs` returns "Search failed: fetch failed"

The **search_docs** tool needs the gateway to connect to **Qdrant**. The "fetch failed" error usually means it can’t reach Qdrant.

- **If you use local MCP (magaya/usar-mcp) on your PC:** the gateway runs on your machine and uses `QDRANT_URL` from `gateway/.env` (default `http://localhost:6333`). To make `search_docs` work:
  1. **Option A:** SSH tunnel to the instance (see 1d2) and keep it open. With `QDRANT_URL=http://localhost:6333`, the gateway will use the instance’s Qdrant.
  2. **Option B:** Run Qdrant on your PC (e.g. with Docker) and point `QDRANT_URL` to that service.
- **If you use remote MCP (gateway on the instance):** the gateway is already on EC2; `QDRANT_URL` is typically `http://localhost:6333` or a container name. Check that the `mcp-qdrant` container is Up and healthy (`docker compose ps`).

After changing `.env` or opening the tunnel, restart MCP (restart Cursor or reload the window) so it reloads variables.

---

## 1d4. The webapp shows "Azure DevOps is not configured"

If the Azure MCP tools work but `/azure-tasks` shows that error, it’s usually because:

- **MCP** (the `azure_*` tools) loads variables from **`gateway/.env`**.
- **The Docker gateway** (called by the webapp via `/api/azure/*`) loads variables from **`.env`** (repo root) and, in this project, also from **`gateway/.env`**.

**Fix (local):**

1. Make sure `gateway/.env` contains:
   - `AZURE_DEVOPS_BASE_URL`
   - `AZURE_DEVOPS_PROJECT`
   - `AZURE_DEVOPS_PAT`
2. Restart `gateway` and `nginx`:
   - `docker compose restart gateway nginx`

**Quick verification:**

- `http://localhost/api/azure/work-items?from=2026-02-01&to=2026-02-28`

If it returns JSON with `items`, the webapp should be able to list tasks.

## 1e. Cursor can’t connect: "Maximum sessions per user (3) reached"

If Cursor remote MCP fails with that message, on **EC2** do one of these:

**Option A – Increase the limit and restart (recommended)**

On the instance:

```bash
cd ~/MCP-SERVER
# Add to the gateway .env (or the .env used by docker compose)
echo "MAX_SESSIONS_PER_USER=10" >> .env
docker compose restart gateway
```

**Option B – Restart only (clears in-memory sessions)**

```bash
cd ~/MCP-SERVER
docker compose restart gateway
```

After restarting, in Cursor reload MCP or reconnect the "knowledge-hub-remote" server.

---

## 2. Service logs

**All services (latest lines):**

```bash
cd ~/MCP-SERVER
docker compose logs --tail=100
```

**Follow logs live (all):**

```bash
docker compose logs -f
```

**Logs for a specific service:**

```bash
# Gateway (MCP API, search, health)
docker compose logs -f gateway

# Supervisor (indexing inbox + SHARED_DIRS)
docker compose logs -f supervisor

# Qdrant (vector DB)
docker compose logs -f qdrant

# Nginx (HTTP proxy)
docker compose logs -f nginx

# Postgres, Redis, InfluxDB, Grafana, Webapp
docker compose logs -f postgres
docker compose logs -f redis
docker compose logs -f influxdb
docker compose logs -f grafana
docker compose logs -f webapp
```

**Last N lines for a service:**

```bash
docker compose logs --tail=200 gateway
docker compose logs --tail=200 supervisor
```

**One-shot indexing cycle log (if started with nohup):**

```bash
tail -f ~/index-cycle.log
```

---

## 3. Start and stop services

**Start everything (in background):**

```bash
cd ~/MCP-SERVER
docker compose up -d
```

**Stop everything:**

```bash
docker compose down
```

**Stop everything and delete volumes (warning: deletes Qdrant/Postgres/etc data):**

```bash
docker compose down -v
```

**Restart a service:**

```bash
docker compose restart gateway
docker compose restart supervisor
docker compose restart nginx
```

**Start only some services:**

```bash
docker compose up -d qdrant influxdb gateway nginx
```

**Stop a specific service:**

```bash
docker compose stop supervisor
docker compose stop gateway
```

**Start a stopped service again:**

```bash
docker compose start supervisor
docker compose start gateway
```

**Container status:**

```bash
docker compose ps
# or more details
docker ps -a
```

---

## 4. Indexing and Qdrant

**Repeatable tests:** See [docs/PRUEBAS-INDEXACION-ONE-TIME.md](PRUEBAS-INDEXACION-ONE-TIME.md) to verify classic/blueivory are not re-indexed, with commands from the instance or the local machine.

**Count indexed documents (points) in Qdrant**

*From the instance (SSH):*

```bash
# Full response (includes points_count)
curl -s http://localhost:6333/collections/mcp_docs | grep points_count

# Only the number (points_count)
curl -s http://localhost:6333/collections/mcp_docs | grep -o '"points_count":[0-9]*'
```

*From Cursor / MCP (gateway tool):*

With the gateway MCP server configured in Cursor, you can ask it to count documents and it will use the `count_docs` tool:

- Type in chat: **"count indexed documents"** or **"how many documents are in Qdrant?"**
- Or invoke the tool by name: **count_docs** (no arguments).

The gateway returns: collection (`mcp_docs`) and total indexed documents.

**What the output of `curl ... | grep points_count` means**

- **points_count:** number of points (chunks) in the collection. Each file can generate multiple points if chunked. This is the “total records” in Qdrant.
- **vectors_count / indexed_vectors_count:** indexed vectors (similar to points_count; there can be a small delay while indexing catches up).
- **status: green:** the collection is healthy.

If the number **goes up** (e.g. from 65k to 93k), it’s usually because **new files are being added** (e.g. the first full blueivory cycle), not because the same files are being re-indexed. The indexer **does not re-send** files that are already in the index.

**Why we don’t re-index the same content (and don’t waste API spend)**

1. **Already-indexed keys:** At the start of each cycle, all indexed `(project, path)` keys are loaded from Qdrant (or persistent SQLite). Only files whose key is **not** in that set are sent for embeddings (new files).
2. **One-time (classic / blueivory):** If a project is in `SHARED_DIRS_ONCE` and already exists in `data/one_time_indexed.db`, it is **not processed** in later cycles: the folder isn’t scanned and the API isn’t called.
3. **Reindex only if changed:** Only if you enable `INDEX_SHARED_REINDEX_CHANGED=true` will files be re-indexed when their **content** changes (by hash). Off by default.

So API spend growth corresponds to **new content** (e.g. blueivory the first time), not repeatedly processing the same files.

**Run a one-shot indexing cycle (inbox + SHARED_DIRS) and follow the log:**

```bash
cd ~/MCP-SERVER
nohup docker compose run --rm supervisor node dist/supervisor.js --once > ~/index-cycle.log 2>&1 &
tail -f ~/index-cycle.log
```

**Kill a running indexing cycle (by process):**

```bash
pkill -f "supervisor.js"
```

**Determine if the indexing cycle finished successfully:**

- **Finished successfully:** the log should include `indexSharedDirs completed` and, if you indexed classic and blueivory in one-shot mode, also `indexSharedDirs one-time complete` for both projects.
- **Finished with failure:** if `Fatal error` appears in the log, the process stopped due to an error (e.g. token limit or rate limit after all retries).

Commands to check it (from the instance):

```bash
# Finished OK? (should show lines with "indexSharedDirs completed" and "one-time complete")
grep -E "indexSharedDirs completed|one-time complete" ~/index-cycle.log

# Any fatal error?
grep "Fatal error" ~/index-cycle.log
```

If you **don’t** see `indexSharedDirs completed` and the cycle container is no longer running, check whether there was an error:

```bash
grep -E "Fatal error|Embedding batch failed" ~/index-cycle.log
```

If you only see many `Embedding batch retry` lines (429 rate limit), the process is **still running** or waiting 90s between retries; it hasn’t finished or failed yet. When it succeeds, near the end of the log you’ll see something like:

```text
{"ts":"...","level":"info","message":"indexSharedDirs one-time complete","project":"blueivory"}
{"ts":"...","level":"info","message":"indexSharedDirs completed","indexed":...,"newCount":...,"reindexedCount":...,"errors":0}
```

---

## 5. Services and ports

| Service   | Container    | Port (host) | Usage                    |
|-----------|----------------|---------------|------------------------|
| nginx     | mcp-nginx      | 80            | HTTP (API, webapp)     |
| gateway   | mcp-gateway    | (internal 3001)| MCP API, search      |
| webapp    | mcp-webapp     | (internal 3000)| Next.js app            |
| qdrant    | mcp-qdrant     | 6333          | Vector DB              |
| postgres  | mcp-postgres   | 5432          | Database               |
| redis     | mcp-redis      | 6379          | Queue (worker)         |
| influxdb   | mcp-influxdb   | 8086          | Metrics                |
| grafana   | mcp-grafana    | 3002          | Dashboards             |
| supervisor| mcp-supervisor | —             | Periodic indexing      |

---

## 6. Rebuild and deploy code

**Rebuild images and start (after pulling changes on the instance):**

```bash
cd ~/MCP-SERVER
docker compose build gateway supervisor
docker compose up -d gateway supervisor
```

**View environment variables (e.g. SHARED_DIRS, OPENAI):**

```bash
cat ~/MCP-SERVER/.env
cat ~/MCP-SERVER/gateway/.env
```

Edit `.env` on the instance and then restart the services that use it (gateway, supervisor).

### 6a. Required files/vars on the instance (so Docker Compose “works like before”)

On the **EC2 instance**, before deploying, make sure you have these files (not committed to Git):

- `~/MCP-SERVER/.env` (use `./.env.example` as a base)
- `~/MCP-SERVER/gateway/.env` (use `./gateway/.env.example` as a base)

**Important:** in production, do not leave values like `change-me` / `change-me-in-env` or default tokens.

If critical secrets are missing (Postgres/Influx/Grafana), the `scripts/ec2/instance_update_with_verify.sh` script now detects it and aborts to prevent starting the instance with unsafe defaults.

Create the files from the examples:

```bash
cd ~/MCP-SERVER
cp .env.example .env
cp gateway/.env.example gateway/.env
```

Then edit `.env` and `gateway/.env` (with `nano` or `vim`) and restart:

```bash
docker compose restart gateway supervisor nginx
```

**ClickUp tools (MCP):** To use ClickUp tools via MCP on the instance, add `CLICKUP_API_TOKEN=pk_...` to `~/MCP-SERVER/.env` (or wherever the gateway loads env). Then restart the gateway: `docker compose restart gateway`.

---

## 7. Util scripts (update-repo, etc.)

Utility scripts installed **outside the project** in `/opt/mcp-tools`, available as system commands (no `source`, no paths needed).

**Commands available after install:**

| Command | Description |
|---------|-------------|
| `util_update_repo` | Pull repo, build gateway/supervisor, restart services |
| `update-repo` / `actualizar-repo` | Same (via symlink) |
| `update repo` / `actualizar repo` | Same (via alias; requires a session with profile loaded) |
| `util_health_check_restart` | Checks `/api/health`; if it returns 502, restarts nginx (production use) |

**Installation (once on the instance):**

After cloning/pulling the repo, run:

```bash
cd ~/MCP-SERVER
sudo bash scripts/ec2/install-tools.sh
```

Then close and reopen the SSH session (or `source /etc/profile.d/mcp-tools.sh`) so PATH and the space-containing aliases are available.

**What the installer does:**

- Creates `/opt/mcp-tools` and copies scripts from `~/MCP-SERVER/scripts/ec2/`.
- Adds `/opt/mcp-tools` to PATH via `/etc/profile.d/mcp-tools.sh`.
- Creates the `update-repo` / `actualizar-repo` symlinks and the `"update repo"` / `"actualizar repo"` aliases.

**Instance tools from Cursor:**  
- **`instance_update`**: returns the SSH command that runs `scripts/ec2/instance_update_with_verify.sh` on the server: pull, build, restart, health verification (up to 3 attempts). If it fails, it rolls back (`git reset --hard`) and writes status to `.last-update-status` (text file).
- **`instance_report`**: returns the SSH command to print a Markdown status report: current IP, last update, status (`.last-update-status`), containers, health.
- **`instance_reboot`**: returns the SSH command to restart all services (`docker compose restart`).

Default host and key: `ec2-user@52.91.217.181`, `infra/mcp-server-key.pem`. Run the command in Cursor’s terminal (or ask Cursor to run it). **If you use remote MCP:** run it in a terminal on your PC (from the repo root) or in a terminal already connected via SSH. If tools don’t show up, update the instance and reconnect Cursor to MCP.

---

## 8. Production: mitigate 502 when nginx loses connection to gateway

If Cursor stops connecting (502 Bad Gateway) after gateway restarts or network hiccups between containers:

**A) Changes already in the repo (nginx + docker-compose):**

- Nginx re-resolves `gateway` via Docker DNS (`resolver 127.0.0.11`) to avoid stale IPs after restarts.
- `restart: always` on gateway and nginx.
- Nginx waits for the gateway to be healthy before starting (`depends_on` with `condition: service_healthy`).

**B) Automatic health check (cron every 5 min):**

```bash
# On the instance, after installing util scripts:
(crontab -l 2>/dev/null | grep -v util_health_check_restart; echo "*/5 * * * * /opt/mcp-tools/util_health_check_restart >> /var/log/mcp-health.log 2>&1") | crontab -
```

If `/api/health` returns 502 or fails, the script restarts nginx. Use `--gateway` to restart the gateway too:

```bash
/opt/mcp-tools/util_health_check_restart --gateway
```
