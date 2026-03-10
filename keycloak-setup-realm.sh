#!/bin/bash
set -e
cd ~/MCP-SERVER || cd /home/ec2-user/MCP-SERVER
export KEYCLOAK_ADMIN_PASSWORD
export KEYCLOAK_ADMIN
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-$(grep '^KEYCLOAK_ADMIN_PASSWORD=' .env | cut -d= -f2-)}"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-$(grep '^KEYCLOAK_ADMIN=' .env | cut -d= -f2-)}"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
MCP_TEST_PASSWORD="${MCP_TEST_USER_PASSWORD:-change-me-mcp-test}"

echo "Creating realm mcp..."
docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD" 2>/dev/null || true
docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh create realms -s realm=mcp -s enabled=true 2>/dev/null || echo "Realm mcp may already exist."
echo "Creating user mcp-test..."
docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh create users -r mcp -s username=mcp-test -s enabled=true 2>/dev/null || echo "User mcp-test may already exist."
echo "Setting password for mcp-test..."
docker compose exec -T -e KC_PASS="$KEYCLOAK_ADMIN_PASSWORD" -e KC_USER="$KEYCLOAK_ADMIN" -e MCP_PASS="$MCP_TEST_PASSWORD" keycloak /bin/sh -c '/opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user "$KC_USER" --password "$KC_PASS" && /opt/keycloak/bin/kcadm.sh set-password -r mcp --username mcp-test --new-password "$MCP_PASS"'
echo "Done. Realm mcp and user mcp-test (password: $MCP_TEST_PASSWORD) ready."
