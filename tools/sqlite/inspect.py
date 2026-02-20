#!/usr/bin/env python3
import json
import sqlite3
from pathlib import Path

BASE = Path("/tmp/mcp-tools")


def inspect_db(db_path: Path, preferred_table: str, sample_sql: str):
    out = {"path": str(db_path), "exists": db_path.exists()}
    if not db_path.exists():
        return out

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        tables = [r[0] for r in cur.execute("select name from sqlite_master where type='table' order by name")]
        out["tables"] = tables
        table = preferred_table if preferred_table in tables else (tables[0] if tables else None)
        out["table_used"] = table
        if not table:
            out["count"] = 0
            out["sample"] = []
            return out
        out["columns"] = [r[1] for r in cur.execute(f"pragma table_info({table})")]
        out["count"] = cur.execute(f"select count(1) from {table}").fetchone()[0]
        try:
            out["sample"] = cur.execute(sample_sql).fetchall()
        except sqlite3.OperationalError:
            out["sample"] = cur.execute(f"select * from {table} limit 10").fetchall()
        return out
    finally:
        conn.close()


indexed = inspect_db(
    BASE / "indexed_keys.db",
    "indexed_keys",
    "select project, source_path, substr(content_hash,1,12) as hash12 from indexed_keys order by project, source_path limit 20",
)
stats = inspect_db(
    BASE / "indexing_stats.db",
    "daily_stats",
    "select date, inbox, shared_new, shared_reindexed, url, updated_at from daily_stats order by date desc limit 20",
)

print(json.dumps({"indexed_keys_db": indexed, "indexing_stats_db": stats}, ensure_ascii=False, indent=2))
