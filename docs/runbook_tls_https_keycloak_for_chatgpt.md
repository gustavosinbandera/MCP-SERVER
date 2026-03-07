# Runbook: TLS + HTTPS discovery para ChatGPT (auth.domoticore.co)

**Objetivo:** Que ChatGPT acepte la conexión OAuth a tu MCP: certificado Let's Encrypt real en `auth.domoticore.co` y Keycloak generando discovery en **https** (hostname v2).

**Causas típicas del fallo:**

- Certificado **autofirmado** en `auth.domoticore.co` → la infra de ChatGPT no lo acepta y no llega tráfico (no hay logs en auth).
- Keycloak con **proxy v1** (`KC_PROXY=edge`) → discovery puede salir en `http` y ChatGPT corta.

---

## 1. Poner Let's Encrypt REAL en auth.domoticore.co

**Requisitos:** DNS de `auth.domoticore.co` apuntando a la instancia; puerto 80 accesible desde internet (para el challenge ACME).

### En la EC2 (o donde corre Docker)

```bash
cd ~/MCP-SERVER   # o la ruta de tu repo

# Nginx debe estar arriba para servir /.well-known/acme-challenge/
docker compose up -d nginx

# Obtener certificado (usa el email que quieras para avisos de Let's Encrypt)
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  -d auth.domoticore.co \
  --email "${LETSENCRYPT_EMAIL:-tu@email.com}" --agree-tos --no-eff-email --non-interactive

# Reiniciar nginx para cargar el cert
docker compose restart nginx
```

Si Let's Encrypt crea `auth.domoticore.co-0001` (por intentos previos), ajusta `nginx.conf`:

- Reemplaza `live/auth.domoticore.co/` por `live/auth.domoticore.co-0001/` en el bloque `server_name auth.domoticore.co`.
- O comprueba el nombre real:
  ```bash
  docker exec mcp-nginx ls -1 /etc/letsencrypt/live
  ```

### Verificar que ya no es autofirmado

```bash
openssl s_client -connect auth.domoticore.co:443 -servername auth.domoticore.co </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates
```

- **Correcto:** `issuer` tipo `CN=R3, O=Let's Encrypt, ...`
- **Incorrecto:** `issuer=CN=auth.domoticore.co` (sigue autofirmado)

---

## 2. Forzar a Keycloak a generar discovery en https (hostname v2)

En **docker-compose.yml**, el servicio `keycloak` debe usar **hostname v2** (sin `KC_PROXY` / proxy v1):

```yaml
keycloak:
  ...
  command: ["start", "--hostname", "https://auth.domoticore.co", "--proxy-headers", "xforwarded", "--http-enabled", "true"]
```

No uses `KC_PROXY: edge` ni `--proxy=edge`.

En **nginx** (bloque `server_name auth.domoticore.co`), en las `location` que hacen proxy a Keycloak o al gateway, incluir:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Port 443;
proxy_set_header X-Forwarded-Host $host;
```

Luego:

```bash
docker compose up -d --force-recreate nginx
docker compose up -d --force-recreate keycloak
```

### Validar discovery

```bash
curl -fsS https://auth.domoticore.co/realms/mcp/.well-known/openid-configuration \
  | jq '.issuer, .registration_endpoint'
```

Todo debe ser `https://auth.domoticore.co/...`.

---

## 3. Retestar con logs (debería aparecer auth.domoticore.co)

Con esto en una terminal:

```bash
docker logs -f mcp-nginx 2>&1 | grep -E 'auth\.domoticore\.co|clients-registrations|openid|oauth|well-known' || true
```

En ChatGPT, pulsa "Crear" en el conector MCP con OAuth.

**Esperado:**

- `POST /realms/mcp/clients-registrations/openid-connect` → 201
- `GET /realms/mcp/clients-registrations/openid-connect/<id>` → 200

Si tras poner Let's Encrypt real **sigue sin verse tráfico** a auth.domoticore.co, revisar que el discovery que consume ChatGPT (p. ej. `https://mcp.domoticore.co/.well-known/openid-configuration` o `.../api/mcp`) tenga todo en `https://auth.domoticore.co/...` y que `registration_endpoint` sea exactamente `https://auth.domoticore.co/realms/mcp/clients-registrations/openid-connect`.

---

## Resumen de pasos mínimos

| Orden | Acción |
|-------|--------|
| 1 | Let's Encrypt real para `auth.domoticore.co` (certbot + restart nginx). |
| 2 | Verificar cert con `openssl s_client ... \| openssl x509 -noout -issuer`. |
| 3 | Keycloak con hostname v2 (`command: start --hostname https://... --proxy-headers xforwarded --http-enabled true`), sin KC_PROXY. |
| 4 | Nginx auth: headers `X-Forwarded-Proto`, `X-Forwarded-Port 443`, `X-Forwarded-Host`. |
| 5 | `docker compose up -d --force-recreate nginx keycloak`. |
| 6 | Validar discovery con `curl ... \| jq '.issuer,.registration_endpoint'`. |
| 7 | Probar conector en ChatGPT con `docker logs -f mcp-nginx` para ver tráfico a auth. |
