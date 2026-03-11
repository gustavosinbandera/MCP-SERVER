# Azure Bug History Query Pack (Postgres)

This query pack is designed for the BlueIvory RC hotfix historical dataset in remote Postgres (`mcp_hub`).

Primary scope used during bootstrap:

- `$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC-HOTFIX`

Core tables:

- `azure_changesets`
- `azure_changeset_files`
- `azure_changeset_work_items`
- `azure_work_items_cache`
- `azure_file_history_signals`
- `azure_ingest_runs`
- `azure_ingest_checkpoints`

## 1) Latest ingest run health

```sql
SELECT
  run_id,
  mode,
  status,
  started_at,
  finished_at,
  ingested_changesets,
  ingested_files,
  ingested_work_item_links,
  distinct_work_items,
  last_error
FROM azure_ingest_runs
ORDER BY started_at DESC
LIMIT 20;
```

## 2) Checkpoint status by window

```sql
SELECT
  mode,
  path_scope,
  window_from,
  window_to,
  status,
  processed_changesets,
  last_changeset_id,
  updated_at,
  last_error
FROM azure_ingest_checkpoints
WHERE path_scope = '$/Magaya Core Project/Projects/MAIN-BRANCHES/BLUE-IVORY-RC-HOTFIX'
ORDER BY window_from;
```

## 3) Bugs with richer metadata (not title-only)

```sql
SELECT
  work_item_id,
  type,
  state,
  title,
  area_path,
  iteration_path,
  assigned_to,
  priority,
  severity,
  changed_date
FROM azure_work_items_cache
WHERE type = 'Bug'
ORDER BY changed_date DESC
LIMIT 100;
```

## 4) Similar bug candidates by title pattern + resolved state

```sql
SELECT
  w.work_item_id,
  w.title,
  w.state,
  w.changed_date,
  COUNT(DISTINCT cw.changeset_id) AS related_changesets,
  COUNT(DISTINCT f.file_path) AS touched_files
FROM azure_work_items_cache w
JOIN azure_changeset_work_items cw ON cw.work_item_id = w.work_item_id
JOIN azure_changeset_files f ON f.changeset_id = cw.changeset_id
WHERE w.type = 'Bug'
  AND w.state IN ('Resolved', 'Closed', 'Done')
  AND w.title ~* '(shipment|invoice|awb)'
GROUP BY w.work_item_id, w.title, w.state, w.changed_date
ORDER BY touched_files DESC, related_changesets DESC
LIMIT 50;
```

## 5) Changeset clusters per work item

```sql
SELECT
  cw.work_item_id,
  MIN(c.created_at) AS first_change,
  MAX(c.created_at) AS last_change,
  COUNT(DISTINCT c.changeset_id) AS changeset_count,
  COUNT(DISTINCT f.file_path) AS file_count
FROM azure_changeset_work_items cw
JOIN azure_changesets c ON c.changeset_id = cw.changeset_id
LEFT JOIN azure_changeset_files f ON f.changeset_id = c.changeset_id
GROUP BY cw.work_item_id
ORDER BY changeset_count DESC, file_count DESC
LIMIT 100;
```

## 6) Link confidence source (`comment` vs `relation`)

```sql
SELECT
  source,
  COUNT(*) AS link_count
FROM azure_changeset_work_items
GROUP BY source
ORDER BY link_count DESC;
```

## 7) Most frequently touched files for a bug title pattern

```sql
SELECT
  f.file_path,
  f.module,
  COUNT(*) AS touches
FROM azure_work_items_cache w
JOIN azure_changeset_work_items cw ON cw.work_item_id = w.work_item_id
JOIN azure_changeset_files f ON f.changeset_id = cw.changeset_id
WHERE w.type = 'Bug'
  AND w.title ~* '(printing|label|orientation)'
GROUP BY f.file_path, f.module
ORDER BY touches DESC
LIMIT 50;
```

## 8) Use file-history signals as ranking evidence

```sql
SELECT
  f.file_path,
  f.module,
  hs.recent_changesets_count,
  hs.distinct_recent_authors,
  hs.last_changed_at,
  hs.last_author
FROM azure_changeset_files f
JOIN azure_file_history_signals hs ON hs.file_path = f.file_path
GROUP BY f.file_path, f.module, hs.recent_changesets_count, hs.distinct_recent_authors, hs.last_changed_at, hs.last_author
ORDER BY hs.recent_changesets_count DESC, hs.last_changed_at DESC
LIMIT 100;
```

## 9) Retrieve bug narrative context (description/repro/expected/actual)

```sql
SELECT
  work_item_id,
  title,
  description_text,
  repro_steps_text,
  expected_behavior_text,
  actual_behavior_text
FROM azure_work_items_cache
WHERE work_item_id = 127713;
```

## 10) Candidate matches for a new bug title with module evidence

```sql
WITH candidates AS (
  SELECT
    w.work_item_id,
    w.title,
    w.state,
    w.changed_date,
    COUNT(DISTINCT c.changeset_id) AS cs_count,
    COUNT(DISTINCT f.file_path) AS file_count,
    STRING_AGG(DISTINCT f.module, ', ') AS modules
  FROM azure_work_items_cache w
  JOIN azure_changeset_work_items cw ON cw.work_item_id = w.work_item_id
  JOIN azure_changesets c ON c.changeset_id = cw.changeset_id
  JOIN azure_changeset_files f ON f.changeset_id = c.changeset_id
  WHERE w.type = 'Bug'
    AND w.title ~* '(new bug title keywords here)'
  GROUP BY w.work_item_id, w.title, w.state, w.changed_date
)
SELECT *
FROM candidates
ORDER BY file_count DESC, cs_count DESC, changed_date DESC
LIMIT 30;
```
