#!/usr/bin/env bash
# Audit env files + container env presence on EC2 (no secrets printed).
# Usage (on EC2): cd ~/MCP-SERVER && bash scripts/ec2/audit-env.sh

set -euo pipefail

REPO_DIR="${MCP_REPO_DIR:-$HOME/MCP-SERVER}"
cd "$REPO_DIR" || { echo "Error: repo not found at $REPO_DIR"; exit 1; }

echo "## MCP-SERVER EC2 env audit (no secrets)"
echo "Repo: $REPO_DIR"
echo

echo "## Files"
for f in .env gateway/.env docker-compose.yml; do
  if [[ -f "$f" ]]; then
    echo "- $f: present"
  else
    echo "- $f: MISSING"
  fi
done
echo

echo "## Compose env_file wiring (docker-compose.yml)"
grep -nE '^[[:space:]]*env_file:' docker-compose.yml || true
echo

read_env() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || { echo ""; return 0; }
  local line
  line="$(grep -m 1 -E "^${key}=" "$file" 2>/dev/null | tr -d '\r' || true)"
  local val="${line#*=}"
  # Trim surrounding quotes (best effort)
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  echo "$val"
}

is_placeholder() {
  local v
  v="$(echo "${1:-}" | tr '[:upper:]' '[:lower:]')"
  [[ -z "$v" ]] && return 0
  echo "$v" | grep -Eq 'change-me|changeme|mcp-super-secret-token-change-me'
}

status_key() {
  local file="$1" key="$2" v
  v="$(read_env "$file" "$key")"
  if [[ -z "$v" ]]; then
    echo "missing"
  elif is_placeholder "$v"; then
    echo "placeholder"
  else
    echo "present"
  fi
}

print_section() {
  local title="$1" file="$2"; shift 2
  echo "## $title ($file)"
  printf '%-28s %-12s\n' KEY STATUS
  local any=0
  local k st
  for k in "$@"; do
    st="$(status_key "$file" "$k")"
    if [[ "$st" != "present" ]]; then
      any=1
      printf '%-28s %-12s\n' "$k" "$st"
    fi
  done
  if [[ $any -eq 0 ]]; then
    echo "(no missing/placeholder keys detected in this set)"
  fi
  echo
}

ROOT_KEYS=(
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB
  INFLUXDB_INIT_USERNAME INFLUXDB_INIT_PASSWORD INFLUXDB_ORG INFLUXDB_BUCKET INFLUXDB_TOKEN
  GRAFANA_ADMIN_USER GRAFANA_ADMIN_PASSWORD
)

GATEWAY_KEYS=(
  QDRANT_URL SHARED_DIRS INDEX_INBOX_DIR USER_KB_ROOT_DIR
  OPENAI_API_KEY OPENAI_BASE_URL OPENAI_EMBEDDING_MODEL
  CLICKUP_API_TOKEN
  AZURE_DEVOPS_BASE_URL AZURE_DEVOPS_PROJECT AZURE_DEVOPS_PAT
  MCP_API_KEY MCP_API_KEY_USER_ID
)

AUTH_KEYS=(COGNITO_REGION COGNITO_USER_POOL_ID COGNITO_APP_CLIENT_ID COGNITO_JWKS_URL COGNITO_ISSUER)

print_section "Root env checks" ".env" "${ROOT_KEYS[@]}"
print_section "Gateway env checks" "gateway/.env" "${GATEWAY_KEYS[@]}"

echo "## Auth summary (gateway/.env)"
if [[ -n "$(read_env gateway/.env MCP_API_KEY)" ]]; then
  echo "- MCP_API_KEY: set"
else
  echo "- MCP_API_KEY: missing"
fi
any_cog=0
for k in "${AUTH_KEYS[@]}"; do
  [[ -n "$(read_env gateway/.env "$k")" ]] && any_cog=1
done
if [[ $any_cog -eq 0 ]]; then
  echo "- Cognito/JWT: not configured"
else
  echo "- Cognito/JWT vars:"
  for k in "${AUTH_KEYS[@]}"; do
    if [[ -n "$(read_env gateway/.env "$k")" ]]; then
      echo "  - $k: set"
    else
      echo "  - $k: missing"
    fi
  done
fi
echo

echo "## Docker compose ps"
docker compose ps || true
echo

echo "## Container env (presence only)"
check_container() {
  local svc="$1"; shift
  echo "### $svc"
  if ! docker compose ps --status running --services 2>/dev/null | grep -qx "$svc"; then
    echo "- not running"
    echo
    return 0
  fi
  docker compose exec -T "$svc" sh -lc '
    for k in '"$*"'; do
      v="$(printenv "$k" 2>/dev/null || true)"
      if [ -n "$v" ]; then
        echo "$k=present"
      else
        echo "$k=missing"
      fi
    done
  ' || true
  echo
}

check_container gateway "QDRANT_URL OPENAI_API_KEY CLICKUP_API_TOKEN AZURE_DEVOPS_PAT MCP_API_KEY INFLUXDB_URL INFLUXDB_ORG INFLUXDB_BUCKET INFLUXDB_TOKEN SHARED_DIRS INDEX_INBOX_DIR USER_KB_ROOT_DIR DATABASE_URL"
check_container supervisor "QDRANT_URL OPENAI_API_KEY SHARED_DIRS INDEX_INBOX_DIR USER_KB_ROOT_DIR INFLUXDB_URL INFLUXDB_TOKEN"

echo "## Placeholder/default secrets checks (no values)"
check_eq() {
  local svc="$1" var="$2" expected="$3" label="$4"
  if ! docker compose ps --status running --services 2>/dev/null | grep -qx "$svc"; then
    echo "- $label: service_not_running"
    return 0
  fi
  docker compose exec -T "$svc" sh -lc "
    v=\${$var-}
    if [ -z \"\$v\" ]; then
      echo \"- $label: missing\"
    elif [ \"\$v\" = \"$expected\" ]; then
      echo \"- $label: DEFAULT\"
    else
      echo \"- $label: OK\"
    fi
  " || echo "- $label: check_failed"
}

# Defaults in docker-compose.yml are not safe for production.
check_eq postgres POSTGRES_PASSWORD postgres POSTGRES_PASSWORD
check_eq influxdb DOCKER_INFLUXDB_INIT_PASSWORD change-me-in-env INFLUXDB_INIT_PASSWORD
check_eq influxdb DOCKER_INFLUXDB_INIT_ADMIN_TOKEN mcp-super-secret-token-change-me INFLUXDB_TOKEN
check_eq grafana GF_SECURITY_ADMIN_PASSWORD change-me-in-env GRAFANA_ADMIN_PASSWORD
echo

echo "Done."

