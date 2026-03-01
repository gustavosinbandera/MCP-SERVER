#!/usr/bin/env bash
# Backup gateway_data volume (SQLite) into gateway/snapshots on the EC2 host.
#
# Usage (on EC2):
#   cd ~/MCP-SERVER
#   bash scripts/ec2/backup-gateway-data.sh
#
# Output:
#   ~/MCP-SERVER/gateway/snapshots/gateway_data_<UTC_TIMESTAMP>.tgz
#
# Notes:
# - This backs up ONLY the gateway_data Docker volume (mounted at /app/data).
# - By default it stops gateway+supervisor briefly for SQLite consistency, then starts them back.

set -euo pipefail

REPO_DIR="${MCP_REPO_DIR:-$HOME/MCP-SERVER}"
STOP_SERVICES="${MCP_BACKUP_STOP_SERVICES:-1}" # set to 0 to avoid stopping

cd "$REPO_DIR" || { echo "Error: repo not found at $REPO_DIR"; exit 1; }

mkdir -p gateway/snapshots

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="gateway/snapshots/gateway_data_${TS}.tgz"
OUT_BASE="$(basename "$OUT")"

echo "Creating gateway_data backup -> $OUT"

if [[ "$STOP_SERVICES" = "1" || "$STOP_SERVICES" = "true" || "$STOP_SERVICES" = "yes" ]]; then
  echo "Stopping gateway + supervisor (for SQLite consistency)..."
  docker compose stop gateway supervisor >/dev/null
fi

docker run --rm \
  -v gateway_data:/v:ro \
  -v "$PWD/gateway/snapshots":/b \
  alpine:3.19 sh -lc "cd /v; tar -czf /b/$OUT_BASE ."

if [[ "$STOP_SERVICES" = "1" || "$STOP_SERVICES" = "true" || "$STOP_SERVICES" = "yes" ]]; then
  echo "Starting gateway + supervisor..."
  docker compose start gateway supervisor >/dev/null
fi

ls -la "$OUT"
echo "Done."

