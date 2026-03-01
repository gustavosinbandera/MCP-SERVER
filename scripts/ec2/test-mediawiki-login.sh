#!/usr/bin/env bash
# Prueba login MediaWiki con curl (ejecutar en la instancia EC2). LF only.
set -e
cd ~/MCP-SERVER || exit 1

function read_env_value() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]]; then
    echo ""
    return 0
  fi
  local line
  line="$(grep -m 1 -E "^${key}=" "$file" 2>/dev/null | tr -d '\r' || true)"
  local val="${line#*=}"
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  echo "$val"
}

# Preferir gateway/.env (docker-compose lo carga); fallback a .env por compatibilidad.
INDEX_URL_USER="$(read_env_value "gateway/.env" "INDEX_URL_USER")"
INDEX_URL_PASSWORD="$(read_env_value "gateway/.env" "INDEX_URL_PASSWORD")"
if [[ -z "$INDEX_URL_USER" || -z "$INDEX_URL_PASSWORD" ]]; then
  INDEX_URL_USER="$(read_env_value ".env" "INDEX_URL_USER")"
  INDEX_URL_PASSWORD="$(read_env_value ".env" "INDEX_URL_PASSWORD")"
fi

if [[ -z "$INDEX_URL_USER" || -z "$INDEX_URL_PASSWORD" ]]; then
  echo "Faltan INDEX_URL_USER / INDEX_URL_PASSWORD en gateway/.env (o .env)."
  echo "Configura esas variables y reintenta."
  exit 1
fi

export INDEX_URL_USER
export INDEX_URL_PASSWORD
COOKIE_JAR=$(mktemp)
trap "rm -f $COOKIE_JAR" EXIT
echo "--- Paso 1: Token de login (guardando cookies) ---"
RAW=$(curl -s -A 'MCP-Knowledge-Hub/1.0' -c "$COOKIE_JAR" -b "$COOKIE_JAR" 'https://dev.magaya.com/api.php?action=query&meta=tokens&type=login&format=json')
TOKEN=$(echo "$RAW" | sed -n 's/.*"logintoken":"\([^"]*\)".*/\1/p' | tr -d '\r')
if [ -z "$TOKEN" ] && command -v jq >/dev/null 2>&1; then
  TOKEN=$(echo "$RAW" | jq -r '.query.tokens.logintoken' | tr -d '\r')
fi
if [ -z "$TOKEN" ]; then
  echo "No se obtuvo logintoken."
  exit 1
fi
echo "Token OK (${#TOKEN} chars)"
echo "--- Paso 2: POST login (con mismas cookies) ---"
RES=$(curl -s -X POST -A 'MCP-Knowledge-Hub/1.0' -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  --data-urlencode "action=login" \
  --data-urlencode "lgname=$INDEX_URL_USER" \
  --data-urlencode "lgpassword=$INDEX_URL_PASSWORD" \
  --data-urlencode "lgtoken=$TOKEN" \
  --data-urlencode "format=json" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  'https://dev.magaya.com/api.php')
echo "$RES" | head -c 800
echo ""
if echo "$RES" | grep -q '"result":"Success"'; then
  echo ">>> Login: Success"
else
  echo ">>> Login: FAIL"
  exit 1
fi
