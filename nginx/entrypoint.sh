#!/bin/sh
# Crea certificado autofirmado si no existen los de Let's Encrypt (para que nginx arranque).
# Tras el primer "docker compose run certbot certonly ...", certbot escribe en el mismo volumen
# y nginx usará los certs reales (reiniciar nginx o hacer reload).
CERT_DIR="/etc/letsencrypt/live/mcp.domoticore.co"
mkdir -p "$CERT_DIR"
if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
  echo "No Let's Encrypt certs found; creating self-signed for mcp.domoticore.co"
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out "$CERT_DIR/fullchain.pem" \
    -subj "/CN=mcp.domoticore.co"
fi
exec nginx -g "daemon off;"
