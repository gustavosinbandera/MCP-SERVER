# Azure Ingest Operations Runbook (BlueIvory RC Hotfix)

## Scope

Primary TFVC path used for historical ingestion:

- `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC-HOTFIX`

## Architecture

- Local MCP (VPN/PAT side) reads Azure DevOps.
- Remote EC2 Postgres (`mcp_hub`) stores historical data.
- Ingest uses SSH + `docker compose exec -T postgres psql` on the instance.

## Tables

- Data: `azure_changesets`, `azure_changeset_files`, `azure_changeset_work_items`, `azure_work_items_cache`
- Runtime/audit: `azure_ingest_runs`, `azure_ingest_checkpoints`
- File-history evidence: `azure_file_history_signals`

## Bootstrap (historical windows)

Use monthly windows (recommended) for the last 12 months.

Example tool parameters:

- `paths`: `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC-HOTFIX`
- `from_date`: window start (`YYYY-MM-DD`)
- `to_date`: window end (`YYYY-MM-DD`)
- `include_work_items`: `true`
- `include_file_history_signals`: `true` for selected runs
- `file_history_max_files`: `120` (or smaller for faster runs)
- `file_history_top_per_file`: `40`

## Daily incremental sync

Use overlap to avoid gaps:

- `days_back=2` or `3`
- Optional file-history signals can be enabled on daily runs with lower limits.

## Resume behavior

- Checkpoints are persisted per `mode + path + window`.
- Re-running the same completed window skips re-ingestion.
- Failed windows are marked as `failed` and can be retried safely.
- UPSERT semantics make reruns idempotent.

## Disk safety policy

- Warning when remote disk usage is >= 80%.
- Hard stop when remote disk usage is >= 90%.
- On hard stop: expand disk first, then rerun the same window.

## Validation checklist

1. Run status/counters in `azure_ingest_runs` are updated.
2. Window checkpoint in `azure_ingest_checkpoints` is `completed`.
3. Data counts increase as expected in core tables.
4. Rich bug fields are present in `azure_work_items_cache`.
5. File-history signals exist when enabled.

## Quick SQL checks

```sql
SELECT mode, status, started_at, finished_at, ingested_changesets, ingested_files
FROM azure_ingest_runs
ORDER BY started_at DESC
LIMIT 20;
```

```sql
SELECT path_scope, window_from, window_to, status, processed_changesets
FROM azure_ingest_checkpoints
ORDER BY updated_at DESC
LIMIT 30;
```

```sql
SELECT
  (SELECT COUNT(*) FROM azure_changesets) AS changesets,
  (SELECT COUNT(*) FROM azure_changeset_files) AS files,
  (SELECT COUNT(*) FROM azure_changeset_work_items) AS links,
  (SELECT COUNT(*) FROM azure_work_items_cache) AS work_items,
  (SELECT COUNT(*) FROM azure_file_history_signals) AS file_signals;
```
