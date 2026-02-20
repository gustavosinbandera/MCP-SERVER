#!/usr/bin/env bash
set -euo pipefail

COLLECTION="${1:-mcp_docs}"
echo "Collection: ${COLLECTION}"
curl -s "http://localhost:6333/collections/${COLLECTION}"
