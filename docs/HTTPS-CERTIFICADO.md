# HTTPS y certificado Let's Encrypt (mcp.domoticore.co)

Documentación del despliegue HTTPS en la instancia EC2: nginx, Certbot, obtención y renovación del certificado, y configuración de clientes (Cursor, ChatGPT).

---

## 1. Resumen

- **Dominio:** `mcp.domoticore.co` (registro A en Route 53 apuntando a la IP de la EC2).
- **Puerto 80:** nginx redirige todo a HTTPS, **excepto** `/.well-known/acme-challenge/` (necesario para Let's Encrypt).
- **Puerto 443:** nginx sirve HTTPS con certificado de Let's Encrypt (o certificado autofirmado si aún no se ha obtenido el real).
- **Certbot:** contenedor Docker que obtiene y renueva el certificado; escribe en el volumen compartido `letsencrypt` que monta nginx.
- **Cursor / MCP:** se configura la URL del servidor MCP remoto como `https://mcp.domoticore.co/api/mcp` (no `http://`).

---

## 2. Componentes

| Componente | Función |
|------------|--------|
| **nginx** | Reverse proxy: escucha 80 y 443, redirige HTTP→HTTPS, sirve ACME challenge, proxy a gateway y webapp. |
| **certbot** (contenedor) | Obtiene el certificado la primera vez (`certonly`); en segundo plano ejecuta `certbot renew` cada 12 h. |
| **Volumen `letsencrypt`** | Certificados en `/etc/letsencrypt` (compartido nginx + certbot). |
| **Volumen `certbot_webroot`** | Directorio donde certbot escribe los challenges; nginx lo sirve en `/.well-known/acme-challenge/`. |

---

## 3. Configuración relevante

### 3.1 nginx

- **HTTP (80):**  
  - `location /.well-known/acme-challenge/` → `alias /var/www/certbot/.well-known/acme-challenge/;`  
  - El alias debe coincidir con la ruta donde certbot escribe (webroot `-w /var/www/certbot` crea ahí `.well-known/acme-challenge/TOKEN`). Si el alias apunta solo a `/var/www/certbot/`, Let's Encrypt recibe 404.
- **Resto en 80:** `return 302 https://$host$request_uri;`
- **HTTPS (443):** certificados en `/etc/letsencrypt/live/<nombre>/fullchain.pem` y `privkey.pem`. Si hubo un intento previo fallido, Let's Encrypt puede crear `mcp.domoticore.co-0001`; en ese caso `nginx.conf` debe apuntar a `.../live/mcp.domoticore.co-0001/...`.

### 3.2 Certbot (docker-compose)

- **Entrypoint por defecto:** `/bin/sh` con un bucle `certbot renew --webroot -w /var/www/certbot --quiet; sleep 43200`.
- **Para la primera obtención** hay que ejecutar un contenedor con `--entrypoint certbot` para que el comando sea `certbot certonly ...` y no `sh`.

### 3.3 Entrypoint de nginx

- Si no existen `fullchain.pem` ni `privkey.pem` en `/etc/letsencrypt/live/mcp.domoticore.co`, el entrypoint genera un **certificado autofirmado** con `openssl` para que nginx pueda arrancar. La imagen nginx:alpine debe incluir `openssl` (en el Dockerfile: `RUN apk add --no-cache openssl`).

---

## 4. Obtener el certificado por primera vez

**Requisitos:** el dominio `mcp.domoticore.co` debe resolver a la IP de la EC2 (Route 53) y el puerto 80 debe ser accesible desde internet (security group).

En la instancia EC2:

```bash
cd ~/MCP-SERVER
docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d mcp.domoticore.co \
  --email admin@domoticore.co \
  --agree-tos \
  --non-interactive
```

Sustituye `admin@domoticore.co` por el email que quieras (Let's Encrypt lo usa para avisos de vencimiento).

- Si la obtención es correcta, verás algo como:  
  `Certificate is saved at: /etc/letsencrypt/live/mcp.domoticore.co-0001/fullchain.pem`  
  (el sufijo `-0001` aparece si ya existía un directorio previo por un intento fallido).
- **Cargar el certificado en nginx:**  
  Si el certificado quedó en `mcp.domoticore.co-0001`, `nginx.conf` debe usar esas rutas (ver sección 3.1). Luego:

```bash
docker compose restart nginx
```

---

## 5. Renovación automática

El contenedor **certbot** está configurado para ejecutar `certbot renew --webroot -w /var/www/certbot` cada 12 horas. Los certificados se renuevan automáticamente; nginx puede seguir usando los mismos paths (Let's Encrypt actualiza los archivos en el mismo directorio).

Si en el futuro certbot creara un nuevo directorio (por ejemplo `-0002`), habría que actualizar `nginx.conf` y reiniciar nginx, o usar los symlinks que certbot mantiene en `live/`.

---

## 6. Configurar Cursor para HTTPS

En `.cursor/mcp.json`, el servidor MCP remoto debe usar la URL HTTPS:

```json
"magaya": {
  "url": "https://mcp.domoticore.co/api/mcp",
  "transport": "streamable-http",
  "headers": {
    "Authorization": "Bearer <MCP_API_KEY>"
  }
}
```

- Con **certificado de Let's Encrypt**, Cursor se conecta sin avisos.
- Con **certificado autofirmado**, Cursor (Node.js) puede mostrar `fetch failed: self signed certificate`. Solución recomendada: obtener el certificado real (sección 4). Alternativa temporal en tu PC: arrancar Cursor con `$env:NODE_TLS_REJECT_UNAUTHORIZED="0"` (solo desarrollo).

### 6.1 OAuth discovery (ChatGPT y otros clientes)

Para que clientes como **ChatGPT** reconozcan el servidor como compatible con OAuth (y dejen de mostrar "does not implement OAuth"):

1. **Variables en el gateway** (en la EC2: `gateway/.env` o `.env` en la raíz del proyecto):  
   - **COGNITO_REGION**, **COGNITO_USER_POOL_ID**, **COGNITO_APP_CLIENT_ID** (ya usadas para validar JWT).  
   - **MCP_PUBLIC_BASE_URL**: URL pública del servidor, sin barra final, p. ej. `https://mcp.domoticore.co`.

2. El gateway sirve el **Protected Resource Metadata** (RFC 9728) en `https://mcp.domoticore.co/.well-known/oauth-protected-resource` y, en las respuestas **401**, incluye la cabecera `WWW-Authenticate: Bearer resource_metadata="..."`. Así el cliente puede descubrir el authorization server (Cognito) y ofrecer el flujo OAuth (login con usuario/contraseña en Cognito, luego uso del IdToken como Bearer).

3. **Autenticación:** se mantienen las tres opciones: **MCP_API_KEY** (Bearer fijo, Cursor), **JWT de Cognito** (tras OAuth o login manual) y el discovery OAuth para clientes que lo requieran. No es necesario cambiar Cursor ni el uso de `MCP_API_KEY`.

---

## 7. Probar desde tu máquina

En **PowerShell**, `curl` es un alias de `Invoke-WebRequest`, que no acepta opciones de curl. Usa **`curl.exe`** para las pruebas:

```powershell
# Redirección HTTP → HTTPS (esperado: 302)
curl.exe -sI http://mcp.domoticore.co/

# Health por HTTPS (esperado: 200)
curl.exe -sk -o NUL -w "%{http_code}" https://mcp.domoticore.co/api/health
```

Con certificado válido no hace falta `-k`; con autofirmado, `-k` ignora la verificación.

**Desde la instancia (bash):**

```bash
curl -sI http://127.0.0.1/
curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1/api/health
```

---

## 8. Resolución de problemas

| Problema | Causa / qué hacer |
|---------|-------------------|
| Let's Encrypt devuelve **404** en `/.well-known/acme-challenge/TOKEN` | El `alias` de nginx debe ser `/var/www/certbot/.well-known/acme-challenge/` (certbot escribe ahí). |
| **"live directory exists for mcp.domoticore.co"** | Ya existe un directorio de un intento anterior. Usar `--force-renewal` en el comando `certonly` o comprobar si el cert ya es válido. |
| Certificado guardado en **mcp.domoticore.co-0001** | Actualizar `nginx.conf` con las rutas `.../live/mcp.domoticore.co-0001/fullchain.pem` y `.../privkey.pem`, reconstruir/desplegar nginx y reiniciar. |
| **nginx** en estado Restarting | Revisar logs: `docker compose logs nginx`. Si falta el cert: obtener con certbot (sección 4) o asegurarse de que el entrypoint pueda crear el autofirmado (openssl en la imagen). |
| **certbot** en estado Restarting | El `command` del servicio debe ejecutar el bucle con `sh -c "..."`. Usar `entrypoint: ["/bin/sh"]` y `command: ["-c", "trap exit 0 TERM; while true; do certbot renew ...; sleep 43200; done"]` para que certbot no interprete el script como fichero de configuración. |
| Cursor: **self signed certificate** | Usar certificado Let's Encrypt (sección 4) o, solo en desarrollo, `NODE_TLS_REJECT_UNAUTHORIZED=0` al abrir Cursor. |

---

## 9. Referencias en el repo

- **infra/README.md** – Dominio, Route 53, resumen HTTP/HTTPS.
- **docs/COMANDOS-INSTANCIA-EC2.md** – Conexión SSH, comprobación de servicios, health HTTP/HTTPS con `curl.exe`.
- **nginx/nginx.conf** – Server 80 (ACME + redirect), server 443 (SSL, rutas de certificados).
- **nginx/entrypoint.sh** – Creación de certificado autofirmado si no hay Let's Encrypt.
- **nginx/Dockerfile** – `apk add openssl` para el entrypoint.
- **docker-compose.yml** – Servicios `nginx` y `certbot`, volúmenes `letsencrypt` y `certbot_webroot`.
