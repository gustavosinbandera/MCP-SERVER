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

#
# Validación de entorno (evita levantar producción con defaults inseguros).
# docker-compose carga env_file: .env y gateway/.env. En instancia deben existir.
#
function read_env_value() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]]; then
    echo ""
    return 0
  fi
  # Tomar la primera ocurrencia KEY=..., quitar CR, recortar comillas simples/dobles.
  local line
  line="$(grep -m 1 -E "^${key}=" "$file" 2>/dev/null | tr -d '\r' || true)"
  local val="${line#*=}"
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  echo "$val"
}

function is_placeholder() {
  local v
  v="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
  [[ -z "$v" ]] && return 0
  [[ "$v" == *"change-me"* ]] && return 0
  [[ "$v" == *"changeme"* ]] && return 0
  [[ "$v" == *"mcp-super-secret-token-change-me"* ]] && return 0
  return 1
}

function require_env_file() {
  local file="$1"
  local example="$2"
  if [[ ! -f "$file" ]]; then
    echo "Error: falta $file"
    echo "Crea el archivo copiando el ejemplo:"
    echo "  cp \"$example\" \"$file\""
    echo "Luego edita los valores y reintenta."
    exit 1
  fi
}

STRICT_ENV="${MCP_STRICT_ENV:-0}"

function check_non_placeholder() {
  local file="$1"
  local key="$2"
  local val
  val="$(read_env_value "$file" "$key")"
  if is_placeholder "$val"; then
    if [[ "$STRICT_ENV" = "1" || "$STRICT_ENV" = "true" || "$STRICT_ENV" = "yes" ]]; then
      echo "Error: $key no está definido correctamente en $file (vacío o placeholder)."
      echo "Edita $file y pon un valor real para producción."
      echo "Tip: para no bloquear el deploy temporalmente, ejecuta sin MCP_STRICT_ENV=1."
      exit 1
    fi
    echo "Advertencia: $key está vacío o con placeholder en $file. Estás usando defaults (no recomendado en producción)."
  fi
}

echo "[2/6] Validando archivos .env para Docker Compose..."
require_env_file ".env" ".env.example"
require_env_file "gateway/.env" "gateway/.env.example"

# Secrets críticos que no deben quedarse en defaults/placeholders en la instancia.
check_non_placeholder ".env" "POSTGRES_PASSWORD"
check_non_placeholder ".env" "INFLUXDB_INIT_PASSWORD"
check_non_placeholder ".env" "INFLUXDB_TOKEN"
check_non_placeholder ".env" "GRAFANA_ADMIN_PASSWORD"

# Auth: al menos una opción (JWT Cognito o API key). Si no, el gateway seguirá levantando,
# pero endpoints protegidos (/mcp, /logs) devolverán 401.
COGNITO_REGION="$(read_env_value "gateway/.env" "COGNITO_REGION")"
COGNITO_USER_POOL_ID="$(read_env_value "gateway/.env" "COGNITO_USER_POOL_ID")"
COGNITO_JWKS_URL="$(read_env_value "gateway/.env" "COGNITO_JWKS_URL")"
MCP_API_KEY="$(read_env_value "gateway/.env" "MCP_API_KEY")"
if [[ -z "$MCP_API_KEY" && -z "$COGNITO_JWKS_URL" && ( -z "$COGNITO_REGION" || -z "$COGNITO_USER_POOL_ID" ) ]]; then
  echo "Advertencia: no se detectó auth configurada en gateway/.env (ni MCP_API_KEY ni Cognito)."
  echo "Si vas a usar la webapp o MCP remoto en la instancia, configura Cognito o MCP_API_KEY."
fi

echo "[3/6] Git pull origin $BRANCH..."
git pull origin "$BRANCH"

echo "[4/6] Docker compose build gateway supervisor..."
docker compose build gateway supervisor

echo "[5/6] Docker compose up -d gateway supervisor..."
docker compose up -d gateway supervisor

echo "[6/6] Reinicio de todos los servicios..."
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
