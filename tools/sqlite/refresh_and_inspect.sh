#!/usr/bin/env bash
set -euo pipefail

mkdir -p /tmp/mcp-tools

echo "[1/3] Copiando SQLite desde mcp-supervisor..."
if docker cp mcp-supervisor:/app/data/indexed_keys.db /tmp/mcp-tools/indexed_keys.db 2>/dev/null; then
  echo "  - indexed_keys.db copiada"
else
  rm -f /tmp/mcp-tools/indexed_keys.db
  echo "  - indexed_keys.db no existe aun"
fi

if docker cp mcp-supervisor:/app/data/indexing_stats.db /tmp/mcp-tools/indexing_stats.db 2>/dev/null; then
  echo "  - indexing_stats.db copiada"
else
  rm -f /tmp/mcp-tools/indexing_stats.db
  echo "  - indexing_stats.db no existe aun"
fi

echo "[2/3] Inspeccionando contenido..."
python3 ~/MCP-SERVER/tools/sqlite/inspect.py

echo "[3/3] Listo"
