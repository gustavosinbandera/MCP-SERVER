#!/bin/bash
# En la instancia: ejecuta y deja correr para ver puntos indexados cada minuto.
# Uso: bash report-index-every-min.sh   (o chmod +x y ./report-index-every-min.sh)
LOG="${INDEX_CYCLE_LOG:-$HOME/index-cycle.log}"
for i in $(seq 1 120); do
  echo "=== Min $i @ $(date -Iseconds) ==="
  curl -s http://localhost:6333/collections/mcp_docs 2>/dev/null | grep -o '"points_count":[0-9]*' || echo "points_count: (Qdrant no disponible)"
  echo "--- ultimas 5 lineas log ---"
  tail -5 "$LOG" 2>/dev/null || true
  if grep -q "indexSharedDirs completed\|Error fatal" "$LOG" 2>/dev/null; then
    echo "Ciclo terminado o error. Salida."
    break
  fi
  sleep 60
done
