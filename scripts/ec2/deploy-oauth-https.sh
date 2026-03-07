#!/usr/bin/env bash
# Despliega cambios OAuth/HTTPS: reinicia Keycloak (KC_HOSTNAME_URL) y nginx (X-Forwarded-Host),
# luego verifica que el discovery devuelva https en issuer y registration_endpoint.
# Uso (en EC2): cd ~/MCP-SERVER && bash scripts/ec2/deploy-oauth-https.sh

set -e
REPO="${1:-$HOME/MCP-SERVER}"
if [[ ! -d "$REPO" ]]; then
  REPO="/home/ec2-user/MCP-SERVER"
fi
cd "$REPO" || { echo "No se encontró $REPO"; exit 1; }

echo "[1/4] Reiniciando Keycloak (KC_HOSTNAME_URL=https)..."
docker compose restart keycloak

echo "[2/4] Esperando que Keycloak esté listo (30s)..."
sleep 30

echo "[3/4] Recargando nginx (nueva config con X-Forwarded-Host)..."
docker compose up -d nginx
# Si nginx monta el config desde el repo, un restart carga el nuevo; si no, reload:
docker compose exec -T nginx nginx -t 2>/dev/null && docker compose exec -T nginx nginx -s reload 2>/dev/null || true

echo "[4/4] Comprobando discovery (issuer y registration_endpoint en https)..."
DISCOVERY=$(curl -sS "https://mcp.domoticore.co/.well-known/openid-configuration" 2>/dev/null || true)
if [[ -z "$DISCOVERY" ]]; then
  echo "AVISO: No se pudo obtener discovery (¿curl desde esta máquina tiene acceso a mcp.domoticore.co?)."
  exit 0
fi
ISSUER=$(echo "$DISCOVERY" | jq -r '.issuer // empty')
REG=$(echo "$DISCOVERY" | jq -r '.registration_endpoint // empty')
echo "  issuer: $ISSUER"
echo "  registration_endpoint: $REG"
if [[ "$ISSUER" == https://* ]] && [[ "$REG" == https://* ]]; then
  echo "OK: Discovery devuelve HTTPS."
else
  echo "AVISO: Alguna URL no es https. Revisar KC_HOSTNAME_URL y proxy headers."
fi
