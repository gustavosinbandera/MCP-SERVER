# One-time indexing tests (classic / blueivory)

Test documentation to validate that one-time projects (classic, blueivory) are not re-indexed and that the indexing cycle behaves as expected. Includes commands runnable **from the instance console** or **from the local machine** (PowerShell).

---

## Prerequisites

- On the instance: `SHARED_DIRS` including classic and blueivory (e.g. `classic:/app/classic;blueivory:/app/blueivory`).
- `SHARED_DIRS_ONCE=classic;blueivory` in `.env`.
- Classic and blueivory already indexed once (in `data/one_time_indexed_projects.txt` or `data/one_time_indexed.db`).
- Services: Qdrant and dependencies running (`docker compose up -d`, or at least qdrant + influxdb for the cycle).

---

## Test 1: Verify classic and blueivory are not re-indexed

Goal: when running a `--once` cycle, it must not index any files from classic or blueivory; you should see `skippedOneTime` and `indexed: 0` for shared.

### From the instance (SSH already open)

```bash
cd ~/MCP-SERVER
docker compose run --rm supervisor node dist/supervisor.js --once 2>&1
```

**Expected result:** Output should include:

- `"projects":[]` (no projects to index).
- `"skippedOneTime":["classic","blueivory"]`.
- `"indexSharedDirs skipping one-time-already-done","projects":["classic","blueivory"]`.
- `"indexSharedDirs completed","indexed":0,"newCount":0,"reindexedCount":0,"errors":0`.
- `On-demand cycle finished.`

### From the local machine (PowerShell)

A single command that SSHes in and runs the cycle on the instance:

```powershell
cd C:\PROYECTOS\MCP-SERVER
ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181 "cd ~/MCP-SERVER && docker compose run --rm supervisor node dist/supervisor.js --once 2>&1"
```

**Success criteria:** Output contains the same lines as above (`skippedOneTime`, `indexed: 0`, cycle finished).

---

## Test 2: Verify end-of-cycle messages in logs (one-shot cycle)

Goal: confirm via logs that a one-shot cycle finished correctly (`one-time complete` for classic and blueivory, and `indexSharedDirs completed` without a fatal error).

### From the instance

```bash
# Did it finish OK? (one-time complete + indexSharedDirs completed)
grep -E "indexSharedDirs completed|one-time complete" ~/index-cycle.log

# Any fatal error?
grep "Error fatal" ~/index-cycle.log
```

**Expected result:**  
- The first `grep` shows `one-time complete` for classic and blueivory and one `indexSharedDirs completed` line.  
- The second should show nothing new (or only an old error from another run).

### From the local machine

```powershell
ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181 "grep -E 'indexSharedDirs completed|one-time complete' ~/index-cycle.log"
ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181 "grep 'Error fatal' ~/index-cycle.log"
```

---

## Test 3: Count documents in Qdrant

Goal: verify the number of points in the collection is as expected (it won’t decrease unless something is deleted; it may increase only if new content is indexed, e.g. inbox).

### From the instance

```bash
curl -s http://localhost:6333/collections/mcp_docs | grep points_count
```

**Expected result:** A line like `"points_count":NNNNN` (e.g. 93109). Note the value to compare before/after tests.

### From the local machine

```powershell
ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181 "curl -s http://localhost:6333/collections/mcp_docs" | findstr points_count
```

---

## Test 4: Verify the one-time key is persisted (no re-index)

Goal: confirm classic and blueivory are registered as “already indexed once”.

### From the instance (legacy .txt file)

If you still use the text file:

```bash
cat ~/MCP-SERVER/gateway/data/one_time_indexed_projects.txt 2>/dev/null || docker run --rm -v mcp-server_gateway_data:/app/data alpine cat /app/data/one_time_indexed_projects.txt 2>/dev/null
```

**Expected result:** Lines with `classic` and `blueivory` (or only the one that was indexed).

### From the instance (SQLite, once deployed)

```bash
docker run --rm -v mcp-server_gateway_data:/app/data -e ONE_TIME_INDEXED_DB=/app/data/one_time_indexed.db alpine sh -c "apk add sqlite >/dev/null && sqlite3 /app/data/one_time_indexed.db 'SELECT project FROM one_time_indexed;'" 2>/dev/null
```

Or from the gateway (if you have access to the data folder on the host):

```bash
sqlite3 ~/MCP-SERVER/gateway/data/one_time_indexed.db "SELECT project FROM one_time_indexed;" 2>/dev/null
```

**Expected result:** Rows `classic` and `blueivory`.

---

## Quick summary (copy/paste from local)

```powershell
# Connect to the instance
ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181

# Once inside:
cd ~/MCP-SERVER
docker compose run --rm supervisor node dist/supervisor.js --once 2>&1
grep -E "skippedOneTime|indexSharedDirs completed" 
curl -s http://localhost:6333/collections/mcp_docs | grep points_count
```

Or everything in a single SSH call from local:

```powershell
ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181 "cd ~/MCP-SERVER && docker compose run --rm supervisor node dist/supervisor.js --once 2>&1"
```

If output shows `skippedOneTime: ["classic","blueivory"]` and `indexed: 0`, the one-time tests are considered correct.
