#!/usr/bin/env bash
set -euo pipefail
echo "=== 1) Scroll 1 point (payload only) ==="
echo '{"limit":1,"with_payload":true,"with_vector":false}' > /tmp/scroll.json
curl -s -X POST http://localhost:6333/collections/mcp_docs/points/scroll -H 'Content-Type: application/json' -d @/tmp/scroll.json

echo ""
echo "=== 2) Search via gateway (semantic: almacen) ==="
curl -s "http://localhost/api/search?q=almacen&limit=5"

echo ""
echo "=== 3) Clean BD: delete collection + SQLite ==="
curl -s -X DELETE http://localhost:6333/collections/mcp_docs
docker exec mcp-supervisor sh -c 'rm -f /app/data/indexed_keys.db /app/data/indexing_stats.db'
docker exec mcp-gateway sh -c 'rm -f /app/data/indexed_keys.db /app/data/indexing_stats.db' 2>/dev/null || true
echo "Collection deleted; SQLite cleared."

echo ""
echo "=== 4) Verify empty ==="
curl -s http://localhost:6333/collections/mcp_docs | head -1
