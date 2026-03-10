#!/bin/bash
set -e
cd ~/MCP-SERVER
. ./.env 2>/dev/null || true
KEYCLOAK_DB_PASSWORD="${KEYCLOAK_DB_PASSWORD:-}"
if [ -z "$KEYCLOAK_DB_PASSWORD" ]; then
  KEYCLOAK_DB_PASSWORD=$(grep '^KEYCLOAK_DB_PASSWORD=' .env | cut -d= -f2-)
fi
docker compose exec -T postgres psql -U postgres -d mcp_hub -c "CREATE ROLE keycloak WITH LOGIN PASSWORD 'CHANGE_ME_KEYCLOAK_DB_PASS';" 2>/dev/null || true
docker compose exec -T postgres psql -U postgres -d mcp_hub -c "CREATE DATABASE keycloak OWNER keycloak;" 2>/dev/null || true
docker compose exec -T postgres psql -U postgres -d mcp_hub -c "GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;" 2>/dev/null || true
# Escaping single quote for psql: ' -> ''
PASS_ESC="${KEYCLOAK_DB_PASSWORD//\'/\'\'}"
docker compose exec -T postgres psql -U postgres -d mcp_hub -c "ALTER ROLE keycloak PASSWORD '${PASS_ESC}';"
echo "Keycloak DB and user created."
