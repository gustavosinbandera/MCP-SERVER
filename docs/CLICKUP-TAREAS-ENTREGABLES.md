# ClickUp tasks – MCP-SERVER deliverables (work completed)

Task list to register already completed work in ClickUp. All tasks are assigned to the single developer. Per-task workflow: **Create** → **Move to IN PROGRESS** → **Document in the task** (fill description/subtasks) → **Move to COMPLETED**.

---

## 1. Infrastructure (CloudFormation and EC2)

### 1.1 CloudFormation: EC2 stack and Security Group

**Description (Markdown template to paste into the task):**

```markdown
## What was done
CloudFormation stack for an EC2 instance and Security Group (SSH, HTTP, HTTPS).

## Code / files
- `infra/mcp-ec2.yaml` – template
- `infra/1-create-stack.ps1`, `2-get-outputs.ps1`, `3-delete-stack.ps1` – scripts
- Parameters and outputs (IP, InstanceId)

## How to use
Execution order: 1-create-stack → 2-get-outputs (get IP) → 3-delete-stack to delete.

## How to test
Create the stack, verify outputs; delete the stack and confirm it’s gone.
```

**Suggested subtasks (when moving to In Progress):** Code: `mcp-ec2.yaml` and scripts 1–3; Docs: what each script does; How to use: order and parameters; How to test: create/delete stack and verify outputs.

---

### 1.2 Remote EC2 setup: Docker and project

**Description (template):**

```markdown
## What was done
Script to set up the EC2 instance: install Docker on Amazon Linux, clone/copy the project, run `docker compose up -d`.

## Code / files
- `infra/4-setup-remote.ps1`

## How to use
Run locally against the instance IP (SSH). Requires the key and SSH access.

## How to test
SSH into the instance and confirm services are up.
```

**Suggested subtasks:** Code: `4-setup-remote.ps1`; Docs: steps and SSH prerequisites; How to use: run locally against IP; How to test: SSH and check services.

---

### 1.3 Route53: mcp record and IP updates

**Description (template):**

```markdown
## What was done
DNS record (Route53) for the mcp domain (e.g. mcp.domoticore.co) pointing to the stack IP.

## Code / files
- `infra/5-route53-mcp.ps1`, `route53-mcp-record.json`

## How to use
Run after creating the stack; get the hosted zone id from the AWS console.

## How to test
Verify DNS resolves to the instance IP.
```

**Suggested subtasks:** Code: `5-route53-mcp.ps1` and JSON; Docs: how to get hosted zone id; How to use: run after stack creation; How to test: DNS resolves to the IP.

---

### 1.4 EC2 util scripts: update-repo and installation

**Description (template):**

```markdown
## What was done
Utility scripts on the instance: update-repo (pull, build, restart), install-tools.sh (PATH and aliases in `/opt/mcp-tools`).

## Code / files
- `scripts/ec2/util_update_repo`, `install-tools.sh`

## How to use
On EC2: run `update-repo` after pulling; see COMANDOS-INSTANCIA-EC2 section "Util scripts".

## How to test
Run on EC2 and verify services restart correctly.
```

**Suggested subtasks:** Code: `util_update_repo`, `install-tools.sh`; Docs: COMANDOS-INSTANCIA-EC2 "Util scripts"; How to use: run update-repo after pull; How to test: run on EC2 and observe restart.

---

## 2. Data indexing

### 2.1 INDEX_INBOX and processInbox

**Description (template):**

```markdown
## What was done
Supervisor processes the INDEX_INBOX folder: chunking, embeddings, upsert into Qdrant; then deletes/moves files.

## Code / files
- `inbox-indexer.ts`, `supervisor.ts`

## How to use
Place files into INDEX_INBOX; the supervisor indexes them in the next cycle.

## How to test
Check logs and use count_docs to verify indexed documents.
```

**Suggested subtasks:** Code: inbox-indexer, supervisor; Docs: REVISION-INDEXADOR; How to use: put files into INDEX_INBOX; How to test: logs and count_docs.

---

### 2.2 SHARED_DIRS and one-time (classic, blueivory)

**Description (template):**

```markdown
## What was done
Shared folders classic/blueivory: per-cycle indexing; one-time tracking in SQLite to avoid re-indexing content already indexed.

## Code / files
- `shared-dirs.ts`, `one-time-indexed-db.ts`

## How to use
Configure SHARED_DIRS in .env; the supervisor indexes every cycle.

## How to test
shared-dirs.test.ts and run a supervisor cycle.
```

**Suggested subtasks:** Code: shared-dirs, one-time-indexed-db; Docs: SHARED-DIRS-VS-ONE-TIME; How to use: SHARED_DIRS in .env; How to test: shared-dirs.test.ts and supervisor cycle.

---

### 2.3 URL indexing (index_url, index_site)

**Description (template):**

```markdown
## What was done
MCP tools and module to index a URL or an entire site; render_js option; page limit.

## Code / files
- `url-indexer.ts`, mcp-server (index_url, index_site)

## How to use
From MCP: run index_url / index_site with the URL and parameters.

## How to test
Index a URL and search via search_docs.
```

**Suggested subtasks:** Code: url-indexer, mcp-server (index_url, index_site); Docs: gateway/docs/tools; How to use: MCP index_url / index_site; How to test: index URL and search.

---

### 2.4 Daily indexing stats (SQLite)

**Description (template):**

```markdown
## What was done
Daily indexing stats (inbox, shared_new, shared_reindexed, url) stored in SQLite; endpoint GET /stats/indexing; logs indexing_daily.

## Code / files
- `indexing-stats.ts`, index.ts, supervisor

## How to use
GET /stats/indexing?days=7 (or the desired number of days).

## How to test
indexing-stats.test.ts.
```

**Suggested subtasks:** Code: indexing-stats, index.ts, supervisor; Docs: REVISION-INDEXADOR or API; How to use: GET /stats/indexing?days=7; How to test: indexing-stats.test.ts.

---

### 2.5 Chunking and code-metadata

**Description (template):**

```markdown
## What was done
Text/code chunking; metadata for code (classes, file).

## Code / files
- `chunking.ts`, `code-chunking.ts`, `code-metadata.ts`

## How to use
Used internally by the indexer.

## How to test
chunking.test.ts, code-chunking.test.ts, code-metadata.test.ts.
```

**Suggested subtasks:** Code: chunking, code-chunking, code-metadata; Docs: SUGERENCIAS-INDEXACION; How to use: used by indexer; How to test: the three .test.ts files.

---

### 2.6 Embeddings and semantic search

**Description (template):**

```markdown
## What was done
OpenAI embeddings, similarity search in Qdrant; optional filters.

## Code / files
- `embedding.ts`, `search.ts`, `qdrant-client.ts`

## How to use
MCP tool search_docs with query and filters.

## How to test
embedding.test.ts, search.test.ts.
```

**Suggested subtasks:** Code: embedding, search, qdrant-client; Docs: CHECKLIST-semantica-openai; How to use: MCP search_docs; How to test: embedding.test.ts, search.test.ts.

---

## 3. MCP Gateway (tools and services)

### 3.1 Search tools (search_docs, count_docs)

**Description (template):**

```markdown
## What was done
Semantic search and counting points in Qdrant; filters by project, branch, etc.

## Code / files
- mcp-server (search_docs, count_docs), search.ts

## How to use
From Cursor / using MCP: invoke search_docs or count_docs.

## How to test
search.test.ts.
```

**Suggested subtasks:** Code: mcp-server (search_docs, count_docs), search; Docs: gateway/docs/tools; How to use: from Cursor/usar-mcp; How to test: search.test.ts.

---

### 3.2 Indexing tools and view_url

**Description (template):**

```markdown
## What was done
index_url, index_site, index_url_with_links; view_url with render_js option (Puppeteer).

## Code / files
- mcp-server, url-indexer, fetch-with-browser

## How to use
MCP tools from the client.

## How to test
index.test.ts and manual testing.
```

**Suggested subtasks:** Code: mcp-server, url-indexer, fetch-with-browser; Docs: tools/index_url, view_url; How to use: MCP; How to test: index.test.ts and manual testing.

---

### 3.3 ClickUp: API client and 8 MCP tools

**Description (template):**

```markdown
## What was done
ClickUp API v2 client and 8 MCP tools: list_workspaces, list_spaces, list_folders, list_lists, list_tasks, create_task, get_task, update_task.

## Code / files
- `clickup-client.ts`, mcp-server (clickup_*)

## How to use
CLICKUP_API_TOKEN in .env; invoke tools from MCP.

## How to test
create-clickup-example-task.cjs.
```

**Suggested subtasks:** Code: clickup-client, mcp-server (clickup_*); Docs: CLICKUP-API-REFERENCE; How to use: CLICKUP_API_TOKEN + MCP; How to test: create-clickup-example-task.cjs.

---

### 3.4 Repo/git and GitHub search

**Description (template):**

```markdown
## What was done
repo_git and search_github_repos tools for git operations and GitHub search.

## Code / files
- `repo-git.ts`, `github-search.ts`, mcp-server

## How to use
From MCP with the parameters documented in tools.

## How to test
Manual testing or tests if they exist.
```

**Suggested subtasks:** Code: repo-git, github-search, mcp-server; Docs: tools/repo_git, search_github_repos; How to use: MCP; How to test: manual or tests.

---

### 3.5 Shared dirs: list_shared_dir, read_shared_file

**Description (template):**

```markdown
## What was done
List and read files from shared folders (classic, blueivory).

## Code / files
- mcp-server, shared-dirs

## How to use
MCP tools list_shared_dir and read_shared_file.

## How to test
shared-dirs.test.ts.
```

**Suggested subtasks:** Code: mcp-server, shared-dirs; Docs: tools; How to use: MCP; How to test: shared-dirs.test.ts.

---

## 4. Tests (one task per suite)

For each test task, when moving to "In Progress": (1) Code: file X; (2) What it validates; (3) How to run: `npm run test -- <file>`; (4) "Completed" criteria: all tests pass.

### 4.1 Tests: chunking

**Description (template):**

```markdown
## What it validates
Text chunking (size, overlap, limits).

## Code
`chunking.test.ts`

## How to run
`npm run test -- chunking.test.ts`

## Completed
All tests pass.
```

---

### 4.2 Tests: code-chunking

**Description (template):** Code chunking (functions, classes). File: `code-chunking.test.ts`. Run: `npm run test -- code-chunking.test.ts`. Completed: tests pass.

---

### 4.3 Tests: code-metadata

**Description (template):** Extract class names and referenced types. File: `code-metadata.test.ts`. Run: `npm run test -- code-metadata.test.ts`. Completed: tests pass.

---

### 4.4 Tests: config

**Description (template):** Load configuration from env. File: `config.test.ts`. Run: `npm run test -- config.test.ts`. Completed: tests pass.

---

### 4.5 Tests: embedding

**Description (template):** Embeddings generation (mock or key). File: `embedding.test.ts`. Run: `npm run test -- embedding.test.ts`. Completed: tests pass.

---

### 4.6 Tests: flow-doc

**Description (template):** Flow documents. File: `flow-doc.test.ts`. Run: `npm run test -- flow-doc.test.ts`. Completed: tests pass.

---

### 4.7 Tests: index (gateway)

**Description (template):** Gateway HTTP routes. File: `index.test.ts`. Run: `npm run test -- index.test.ts`. Completed: tests pass.

---

### 4.8 Tests: indexed-keys-db

**Description (template):** Indexed keys DB. File: `indexed-keys-db.test.ts`. Run: `npm run test -- indexed-keys-db.test.ts`. Completed: tests pass.

---

### 4.9 Tests: indexing-stats

**Description (template):** Per-day stats (SQLite). File: `indexing-stats.test.ts`. Run: `npm run test -- indexing-stats.test.ts`. Completed: tests pass.

---

### 4.10 Tests: logger

**Description (template):** Logger. File: `logger.test.ts`. Run: `npm run test -- logger.test.ts`. Completed: tests pass.

---

### 4.11 Tests: search

**Description (template):** Semantic search and filters. File: `search.test.ts`. Run: `npm run test -- search.test.ts`. Completed: tests pass.

---

### 4.12 Tests: shared-dirs

**Description (template):** Shared directories resolution. File: `shared-dirs.test.ts`. Run: `npm run test -- shared-dirs.test.ts`. Completed: tests pass.

---

## 5. Documentation

### 5.1 Doc: CLICKUP-API-REFERENCE

**Description (template):** ClickUp API reference (auth, endpoints, errors). File: `docs/CLICKUP-API-REFERENCE.md`. Subtasks: Code: file; Coverage: auth, /team, /space, /folder, /list, /task; How to use: reference when integrating ClickUp.

---

### 5.2 Doc: COMANDOS-INSTANCIA-EC2

**Description (template):** SSH commands, services, logs, restart, Qdrant, SQLite, ClickUp token. File: `docs/COMANDOS-INSTANCIA-EC2.md`. Subtasks: Code: file; Coverage: connect, docker compose, logs, util scripts; How to use: daily EC2 operations.

---

### 5.3 Doc: SYNC-Y-INDEXACION-DEPLOYS

**Description (template):** Code sync and deploy indexing. File: `docs/SYNC-Y-INDEXACION-DEPLOYS.md`. Subtasks: Code: docs; Coverage: sync flow and indexing; How to use: deployment guide.

---

### 5.4 Doc: REVISION-INDEXADOR and SUGERENCIAS-INDEXACION

**Description (template):** Indexer review and suggestions (metadata, chunking). Files in `gateway/docs/`. Subtasks: Code: REVISION-INDEXADOR, SUGERENCIAS-INDEXACION; Coverage: indexer architecture; How to use: reference for changes.

---

### 5.5 Doc: MCP tools (tools/)

**Description (template):** Per-tool documentation in `gateway/docs/tools/`. Subtasks: Code: README and tool files; Coverage: parameters and examples; How to use: reference for MCP users.

---

### 5.6 Doc: TESTING and phase validation

**Description (template):** `gateway/docs/TESTING.md` and scripts `validate_phase*.ps1`, `validate_all.ps1`. Subtasks: Code: TESTING.md, scripts; Coverage: how to write and run tests; How to use: CI or local.

---

## 6. Docker and services

### 6.1 Docker Compose: service definitions

**Description (template):**

```markdown
## What was done
Service definitions: postgres, redis, qdrant, influxdb, grafana, gateway, supervisor, webapp, nginx.

## Code / files
- `docker-compose.yml`, Dockerfiles

## How to use
`docker compose up -d`

## How to test
Verify services are healthy.
```

**Suggested subtasks:** Code: docker-compose.yml, Dockerfiles; Docs: what each service does; How to use: docker compose up -d; How to test: healthy services.

---

### 6.2 Migrations and datastore startup

**Description (template):**

```markdown
## What was done
Scripts run_migrations.ps1, start_datastores.ps1; SQL schema in scripts/sql/.

## Code / files
- scripts and SQL

## How to use
Run before gateway/supervisor (startup order).

## How to test
Postgres/Redis/Qdrant accessible.
```

**Suggested subtasks:** Code: scripts and SQL; Docs: startup order; How to use: before gateway/supervisor; How to test: datastores accessible.

---

## Summary

| Area           | Count |
|----------------|----------|
| Infrastructure | 4        |
| Indexing       | 6        |
| MCP Gateway    | 5        |
| Tests          | 12       |
| Documentation  | 6        |
| Docker         | 2        |
| **Total**      | **35**   |

Create all tasks in the chosen list (Project 1 or "MCP-SERVER Deliverables"), assigned to the single developer. Then, one by one: **IN PROGRESS** → fill description/subtasks with what was done → **COMPLETED**.
