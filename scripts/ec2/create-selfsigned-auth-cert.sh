#!/bin/bash
# Crea cert autofirmado para auth.domoticore.co en el volumen letsencrypt (misma estructura que Let's Encrypt).
# Cuando tengas DNS, ejecuta certbot y reinicia nginx.
set -e
cd ~/MCP-SERVER || true
VOL="${1:-mcp-server_letsencrypt}"
LIVE="/etc/letsencrypt/live/auth.domoticore.co"
ARCHIVE="/etc/letsencrypt/archive/auth.domoticore.co"
docker run --rm -v "${VOL}:/etc/letsencrypt" alpine sh -c "
  apk add --no-cache openssl
  mkdir -p ${LIVE} ${ARCHIVE}
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout ${LIVE}/privkey.pem -out ${LIVE}/fullchain.pem \
    -subj '/CN=auth.domoticore.co'
  cp ${LIVE}/privkey.pem ${ARCHIVE}/privkey1.pem
  cp ${LIVE}/fullchain.pem ${ARCHIVE}/fullchain1.pem
  echo Self-signed cert created at ${LIVE}
"
echo Done. Restore nginx.conf.full and restart nginx.
