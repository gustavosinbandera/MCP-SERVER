# Feature: Azure DevOps connectivity in MCP

## Summary

Azure DevOps (Server) integration for the MCP Knowledge Hub: tools to list work items, view TFVC changesets and file diffs, from Cursor or any MCP client.

---

## What’s implemented

### Client (`gateway/src/azure/client.ts`)

- **Auth**: PAT (Personal Access Token) via Basic auth. Env vars: `AZURE_DEVOPS_BASE_URL`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT`.
- **Work items**: WIQL queries with filters: type (Bug/Task), states, year, top, assigned to @Me or a specific user.
- **TFVC**: fetch changesets, files modified by changeset, file contents at a changeset, find previous changeset by path for diffs.
- **Diff**: readable diff (LCS) between two file versions from consecutive changesets for the same path.

### MCP tools

| Tool | Description |
|------|-------------|
| **azure** | Alias: `action` "list tasks", optional `user` (e.g. "gustavo grisales"). No user = assigned to you. |
| **azure_list_work_items** | Lists work items. Optional: `assigned_to`, `type`, `states`, `year`, `top`. |
| **azure_get_work_item** | Work item details by ID. |
| **azure_bug_analysis_or_solution** | Analysis or a suggested fix description for a bug. Params: `work_item_id`, `mode` ("analysis" \| "solution"); optional `assigned_to`. Writes either the likely cause (analysis) or a fix description in Markdown (solution). **Always in English** (dashboard language). Requires `OPENAI_API_KEY`; optional `AZURE_DEVOPS_FIELD_ANALYSIS`, `AZURE_DEVOPS_FIELD_SOLUTION`. |
| **azure_get_bug_changesets** | TFVC changesets linked to a bug (ArtifactLink relations): author, date, comment, files. |
| **azure_get_changeset** | Single changeset: author, date, comment, file list. |
| **azure_get_changeset_diff** | File diff in a changeset (optional `file_index`). |

### CLI script

- **gateway/scripts/azure/azure-list-user-tasks.cjs**: Lists work items by user or @Me, with optional year. Usage: `node scripts/azure/azure-list-user-tasks.cjs "gustavo grisales" 2026`.

### Discussion comment format

- In our instance (Azure DevOps Server), **Discussion does not render Markdown** (neither via API nor when pasting). It only shows formatting when pasting “rich” content (e.g. copied from a Markdown preview). That’s why the tool and scripts **always convert Markdown → HTML** and send HTML in `System.History`. See **[AZURE-COMENTARIOS-FORMATO.md](AZURE-COMENTARIOS-FORMATO.md)**.

### Configuration

- `.env`: `AZURE_DEVOPS_BASE_URL`, `AZURE_DEVOPS_PROJECT`, `AZURE_DEVOPS_PAT`. Optional: `AZURE_DEVOPS_API_VERSION` (default 7.0).
- For **azure_bug_analysis_or_solution**: `OPENAI_API_KEY`; optional `AZURE_DEVOPS_FIELD_ANALYSIS` (default `Custom.PossibleCause`), `AZURE_DEVOPS_FIELD_SOLUTION` (default `Custom.SolutionDescription`). Adjust to your process field names if you don’t use those.
- Reference: `gateway/.env.example`.

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
