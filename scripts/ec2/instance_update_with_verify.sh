#!/usr/bin/env bash
# instance_update_with_verify: pull, build, restart; verifica health hasta 3 intentos;
# si falla, revierte (git reset --hard) y guarda estado en archivo de texto para instance_report.
# Uso: desde la instancia, cd ~/MCP-SERVER && bash scripts/ec2/instance_update_with_verify.sh

set -e

REPO_DIR="${MCP_REPO_DIR:-$HOME/MCP-SERVER}"
BRANCH="${MCP_REPO_BRANCH:-master}"
STATUS_FILE="$REPO_DIR/.last-update-status"
HEALTH_URL="http://localhost/api/health"
VERIFY_SLEEP=15
MAX_ATTEMPTS=3

echo "[1/5] Cambiando a $REPO_DIR..."
cd "$REPO_DIR" || { echo "Error: no existe $REPO_DIR"; exit 1; }

echo "[2/5] Git pull origin $BRANCH..."
git pull origin "$BRANCH"

echo "[3/5] Docker compose build gateway supervisor..."
docker compose build gateway supervisor

echo "[4/5] Docker compose up -d gateway supervisor..."
docker compose up -d gateway supervisor

echo "[5/5] Reinicio de todos los servicios..."
docker compose restart

date -u +%Y-%m-%dT%H:%M:%SZ > "$REPO_DIR/.last-instance-update"

echo "Verificando health (hasta $MAX_ATTEMPTS intentos)..."
for i in $(seq 1 "$MAX_ATTEMPTS"); do
  sleep "$VERIFY_SLEEP"
  status=$(curl -s -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || echo "000")
  echo "  Intento $i/$MAX_ATTEMPTS: health=$status"
  if [ "$status" = "200" ]; then
    {
      echo "status=success"
      echo "updated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      echo "health_check=200"
    } > "$STATUS_FILE"
    echo "OK. Servicios en ejecución."
    docker compose ps gateway supervisor
    exit 0
  fi
done

echo "Falló verificación tras $MAX_ATTEMPTS intentos. Revirtiendo..."
git fetch origin
git reset --hard "origin/$BRANCH"
docker compose build gateway supervisor
docker compose up -d gateway supervisor
docker compose restart

reverted_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
{
  echo "status=failed_reverted"
  echo "updated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "reverted_at=$reverted_at"
  echo "health_check=non_200"
} > "$STATUS_FILE"
echo "Revertido. Estado guardado en $STATUS_FILE"
docker compose ps gateway supervisor
exit 1
