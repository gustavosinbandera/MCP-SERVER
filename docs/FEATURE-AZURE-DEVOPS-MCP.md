# Feature: Azure DevOps connectivity in MCP

## Summary

Azure DevOps (Server) integration for the MCP Knowledge Hub: tools to list work items, view TFVC changesets and file diffs, from Cursor or any MCP client.

---

## What’s implemented

### Client (`gateway/src/azure/client.ts`)

- **Auth**: PAT (Personal Access Token) via Basic auth, or **WebSocket tunnel** when the instance has no PAT (see COMANDOS-INSTANCIA-EC2 §1d5). Env vars: `AZURE_DEVOPS_BASE_URL`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT` (or tunnel client with `AZURE_TUNNEL_WS_URL`).
- **Work items**: WIQL queries with filters: type (Bug/Task), year, top, assigned to @Me or a specific user. Opcional: states; si no se indica, se devuelven ítems en cualquier estado.
- **TFVC**: fetch changesets, files modified by changeset, file contents at a changeset, find previous changeset by path for diffs.
- **Diff**: readable diff (LCS) between two file versions from consecutive changesets for the same path.

### Respuesta v2 (envelope) para n8n/LLM

Varias tools devuelven ahora un **envelope estructurado**: texto legible (`summary_text`) + JSON (`data`, `meta`) tras el delimitador `<!--AZURE_V2-->`. Así los flujos n8n pueden usar `data.items` o `data.events` sin parsear texto. Detalle completo: **[AZURE-TOOLS-V2-ENVELOPE.md](AZURE-TOOLS-V2-ENVELOPE.md)**.

### MCP tools

| Tool | Description |
|------|-------------|
| **azure** | Alias: `action` "list tasks", optional `user` (e.g. "gustavo grisales"). No user = assigned to you. |
| **azure_list_work_items** | Lists work items. Returns v2 envelope with `data.items[]`. Optional: `assigned_to`, `type`, `states`, `year`, `top`, `from_date`, `to_date`, `date_field`. |
| **azure_list_work_items_by_date** | List by date range (for n8n). Returns v2 envelope with `data.items[]`. `from_date` required; optional `to_date`, `type`, `states`, `assigned_to`, `top` (max 2000), `date_field`. |
| **azure_find_related_work_items** | Finds work items by title regex in a date range. Optional filters: `type`, `states`, `assigned_to`, `date_field`; can require linked changesets (`must_have_changesets`, default true). |
| **azure_find_related_work_items_with_code_evidence** | Extends related-item search with code evidence using `grep_code` (mgrep) and changed files from linked changesets. Returns ranked matches with `code_evidence_count`, `code_evidence[]`, and `score`. |
| **azure_get_work_item** | Work item details by ID. Optional `mode`: `compact` (default, structured + description/expected/actual/repro), `full`, or `legacy` (plain text only). Returns v2 envelope when not legacy. |
| **azure_get_work_item_updates** | Update history. Returns `data.events[]` and changelog in `summary_text`. Optional: `top`, `summary_only`, `only_relevant_fields`, `include_comments`. |
| **azure_list_repositories** | Lists Azure DevOps Git repositories for a project (`project_name` optional; default from env). |
| **azure_list_tfvc_paths** | Lists TFVC folders/files from a TFVC path. Optional `path`, `recursion_level` (`None`/`OneLevel`/`Full`), `max_results`. |
| **azure_ingest_changesets_bootstrap** | Backfill ingestion for TFVC paths into remote Postgres (EC2) over SSH (`docker compose exec postgres psql`). Params: `paths`, `from_date`, optional `to_date`, `top_per_path`, `dry_run`, SSH overrides. |
| **azure_ingest_changesets_daily** | Daily incremental ingestion for TFVC paths into remote Postgres. Params: `paths`, optional `days_back` (default 2), `top_per_path`, `dry_run`, SSH overrides. |
| **azure_ingest_changesets_bootstrap_start** | Async variant of bootstrap ingest. Returns `job_id`; progress is polled with `azure_ingest_changesets_job_status`. |
| **azure_ingest_changesets_daily_start** | Async variant of daily ingest. Returns `job_id`; progress is polled with `azure_ingest_changesets_job_status`. |
| **azure_ingest_changesets_job_status** | Returns current job status (`queued/running/completed/failed`), stage, percent, counters, and final result/error. |
| **azure_bug_analysis_or_solution** | Analysis or a suggested fix description for a bug. Params: `work_item_id`, `mode` ("analysis" \| "solution"); optional `assigned_to`. Writes either the likely cause (analysis) or a fix description in Markdown (solution). **Always in English** (dashboard language). Requires `OPENAI_API_KEY`; optional `AZURE_DEVOPS_FIELD_ANALYSIS`, `AZURE_DEVOPS_FIELD_SOLUTION`. |
| **azure_get_bug_changesets** | TFVC changesets linked to a bug (ArtifactLink relations): author, date, comment, files. |
| **azure_get_changeset** | Single changeset: author, date, comment, file list. |
| **azure_get_changeset_diff** | File diff in a changeset (optional `file_index`). |

### Recent improvements

- **`azure_get_changeset_diff` fallback:** if TFVC diff endpoint fails (for example 401/permissions on `/tfvc/diffs`), the tool falls back to snapshot comparison (`Cn` vs `Cn-1`) using `getTfvcItemTextAtChangeset`, so the tool still returns useful before/after content.
- **Topic discovery over work items:** regex-based tools now support searching by date window and optionally requiring linked changesets to reduce false positives.
- **Code evidence ranking:** related work items can be scored with mgrep evidence (`grep_code`) cross-checked against files touched in linked changesets.
- **TFVC navigation support:** explicit path listing tool (`azure_list_tfvc_paths`) to explore branch structure and folders without leaving MCP.
- **History indexing tools:** bootstrap + daily ingestion tools to persist TFVC changesets/files/work-item links in remote Postgres for fast regression queries.

### Postgres remote bridge pattern (local Azure -> EC2 DB)

When Azure APIs are only reachable from the local machine (VPN/PAT), but persistence must happen in EC2 Postgres, the ingest tools use:

1. Local MCP extracts TFVC data from Azure.
2. MCP opens SSH to EC2 (`INSTANCE_SSH_TARGET`, `INSTANCE_SSH_KEY_PATH`).
3. SQL is executed remotely via `docker compose exec -T postgres psql -U postgres -d mcp_hub`.

The ingest creates/updates these tables if missing:

- `azure_changesets`
- `azure_changeset_files`
- `azure_changeset_work_items`
- `azure_work_items_cache`

### CLI script

- **gateway/scripts/azure/azure-list-user-tasks.cjs**: Lists work items by user or @Me, with optional year. Usage: `node scripts/azure/azure-list-user-tasks.cjs "gustavo grisales" 2026`.

### Discussion comment format

- In our instance (Azure DevOps Server), **Discussion does not render Markdown** (neither via API nor when pasting). It only shows formatting when pasting “rich” content (e.g. copied from a Markdown preview). That’s why the tool and scripts **always convert Markdown → HTML** and send HTML in `System.History`. See **[AZURE-COMENTARIOS-FORMATO.md](AZURE-COMENTARIOS-FORMATO.md)**.

### Configuration

- `.env`: `AZURE_DEVOPS_BASE_URL`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT`. Optional: `AZURE_DEVOPS_API_VERSION` (default 7.0).
- For **azure_bug_analysis_or_solution**: `OPENAI_API_KEY`; optional `AZURE_DEVOPS_FIELD_ANALYSIS` (default `Custom.PossibleCause`), `AZURE_DEVOPS_FIELD_SOLUTION` (default `Custom.SolutionDescription`). Adjust to your process field names if you don’t use those.
- Reference: `gateway/.env.example`.

### Testing when the gateway is outside the network (tunnel)

When the MCP gateway runs on the **instance** (no VPN, no PAT), use the **WebSocket tunnel**: the instance runs a WS server on port 3097; your machine (with VPN and PAT) runs `npm run azure-tunnel` (in `gateway/`) and connects to the instance. All Azure requests from the instance then go through the tunnel to your script, which calls Azure with your PAT. See **COMANDOS-INSTANCIA-EC2.md** §1d5.

---

## Commit links

- **Azure implementation (TS types, scripts, alias):** [ea15eb7](https://github.com/gustavosinbandera/MCP-SERVER/commit/ea15eb7) — *Azure: TS types in tools, azure-list-user-tasks (user/year/@Me), alias azure list tasks*
- **Feature documentation:** [2f18c5f](https://github.com/gustavosinbandera/MCP-SERVER/commit/2f18c5f) — *docs: FEATURE-AZURE-DEVOPS-MCP (Azure DevOps connectivity in MCP)*

---

## Future: autonomous ticket supervision

- **Autonomous ticket monitoring:** an agent/job that periodically queries Azure DevOps (work items assigned to a user or team), detects states (e.g. blocked, no activity for X days), prioritizes, and notifies or creates follow-up tasks in ClickUp/another system.
- **Configurable rules:** thresholds for days without changes, “at-risk” states, assignment by area/project.
- **Hub integration:** use MCP as the interface so the AI can suggest actions on tickets (e.g. “these 3 bugs have been 7 days in Code Review”) or generate weekly per-user summaries.

---

*Document created as part of closing the ClickUp ticket for the Azure DevOps MCP feature.*
