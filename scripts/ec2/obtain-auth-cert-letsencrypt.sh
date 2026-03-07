#!/usr/bin/env bash
# Obtener certificado Let's Encrypt para auth.domoticore.co (en EC2 o donde corre el compose).
# Requisitos: DNS auth.domoticore.co apuntando a esta máquina; puerto 80 accesible.
# Uso: cd ~/MCP-SERVER && LETSENCRYPT_EMAIL=tu@email.com bash scripts/ec2/obtain-auth-cert-letsencrypt.sh

set -e
REPO="${1:-$HOME/MCP-SERVER}"
cd "$REPO" || { echo "No se encontró $REPO"; exit 1; }

EMAIL="${LETSENCRYPT_EMAIL:-}"
if [[ -z "$EMAIL" ]]; then
  echo "Indica LETSENCRYPT_EMAIL (ej. export LETSENCRYPT_EMAIL=tu@email.com)"
  exit 1
fi

echo "Nginx debe estar arriba para ACME challenge..."
docker compose up -d nginx

echo "Obteniendo certificado Let's Encrypt para auth.domoticore.co..."
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d auth.domoticore.co \
  --email "$EMAIL" --agree-tos --no-eff-email --non-interactive

echo "Reiniciando nginx para cargar el certificado..."
docker compose restart nginx

echo "Comprobando issuer (debe ser Let's Encrypt, no CN=auth.domoticore.co):"
openssl s_client -connect auth.domoticore.co:443 -servername auth.domoticore.co </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates || true

echo "Si Let's Encrypt creó auth.domoticore.co-0001, actualiza nginx.conf con esa ruta y reinicia nginx."
echo "Listo."
