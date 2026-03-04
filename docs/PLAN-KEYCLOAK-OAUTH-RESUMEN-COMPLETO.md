# Resumen completo del plan: Keycloak + OAuth (PKCE + DCR) para MCP y ChatGPT

Documento de referencia con todos los detalles de lo creado e implementado según el plan ejecutado.

---

## Objetivo del plan

Conectar el servidor MCP a **ChatGPT** usando **OAuth 2.0 con PKCE** y **Dynamic Client Registration (DCR)**, con **Keycloak** como servidor de autorización, sin depender del flujo con Cognito (que usa cookie en el redirect y no encaja con el conector de ChatGPT).

---

## Fases del plan y lo implementado

### Fase 0: Variables de entorno y secretos

**Objetivo:** Centralizar en `.env` todas las variables necesarias para Keycloak, DCR y OAuth.

**Archivo modificado:** `.env` (raíz del proyecto).

**Variables añadidas:**

| Variable | Uso |
|----------|-----|
| `KEYCLOAK_DB_PASSWORD` | Contraseña del usuario Postgres `keycloak`. Generada (hex 24 bytes). |
| `KEYCLOAK_ADMIN` | Usuario admin de Keycloak (ej. `admin`). |
| `KEYCLOAK_ADMIN_PASSWORD` | Contraseña del admin de Keycloak. Generada (hex 24 bytes). |
| `MCP_OAUTH_RESOURCE` | URL del recurso MCP (debe ser la que usa ChatGPT: `https://mcp.domoticore.co/api/mcp`). |
| `KEYCLOAK_PUBLIC_URL` | URL pública de Keycloak (ej. `https://auth.domoticore.co`). |
| `KEYCLOAK_REALM` | Realm de Keycloak para MCP (ej. `mcp`). |
| `KEYCLOAK_ISSUER` | Issuer del realm (ej. `https://auth.domoticore.co/realms/mcp`). Si no se define, se construye con PUBLIC_URL + realm. |
| `MCP_GATEWAY_URL` | URL pública del gateway (ej. `https://mcp.domoticore.co`). |
| `MCP_DCR_ALLOWED_REDIRECT_PREFIXES` | Prefijos permitidos para `redirect_uris` en DCR (ej. `https://chatgpt.com/connector/oauth/,https://chatgpt.com/connector_platform_oauth_redirect`). |

**Nota:** DCR ya no exige `Authorization: Bearer` con secret; la seguridad se basa en la allowlist de redirect_uris y en validar `grant_types` y `token_endpoint_auth_method`.

---

### Fase 1: Base de datos Keycloak y servicio en Docker

**Objetivo:** Tener Keycloak con persistencia en Postgres y definido en el compose.

**1.1 Base de datos en Postgres**

- Rol: `keycloak` con LOGIN.
- Base de datos: `keycloak`, propietario `keycloak`.
- Permisos: `GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak`.
- Contraseña del rol tomada de `KEYCLOAK_DB_PASSWORD` en `.env`.

**Scripts creados:**

- **`scripts/create-keycloak-db.ps1`** (Windows/PowerShell): crea rol, DB, permisos y asigna la contraseña desde `.env`. Uso: `.\scripts\create-keycloak-db.ps1` con Docker y Postgres levantados.
- **`scripts/ec2/create-keycloak-db.sh`** (Linux/EC2): equivalente en bash para ejecutar en la instancia.

**1.2 Servicio Keycloak en docker-compose**

**Archivo:** `docker-compose.yml`.

**Servicio `keycloak`:**

- Imagen: `quay.io/keycloak/keycloak:26.0`.
- Base de datos: Postgres (`KC_DB=postgres`, `KC_DB_URL`, `KC_DB_USERNAME=keycloak`, `KC_DB_PASSWORD`).
- Hostname público: `KC_HOSTNAME=auth.domoticore.co`, `KC_HOSTNAME_STRICT=false`, `KC_PROXY=edge`, `KC_HTTP_ENABLED=false`.
- Admin: `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD` desde `.env`.
- Puerto: solo interno `8080` (expose, sin publicar en host).
- Healthcheck: GET a `http://127.0.0.1:8080/health/ready`.
- Comando: `start`.

**Gateway:** se añadió `KEYCLOAK_INTERNAL_URL: http://keycloak:8080` en `environment` para que el gateway hable con Keycloak por la red interna.

**Nginx:** `depends_on` incluye `keycloak` (condition: `service_started`).

---

### Fase 2: Nginx con SNI (dos dominios) y proxy DCR

**Objetivo:** Servir `mcp.domoticore.co` (gateway + webapp) y `auth.domoticore.co` (Keycloak + DCR al gateway) con TLS.

**Archivo:** `nginx/nginx.conf`.

**Bloques principales:**

1. **Puerto 80 (todos los `server_name`):**
   - `/.well-known/acme-challenge/` → certbot (ACME).
   - Resto → redirect 302 a HTTPS.

2. **HTTPS – `server_name mcp.domoticore.co`:**
   - Certificados: `mcp.domoticore.co-0001` (Let's Encrypt).
   - `/.well-known/oauth-protected-resource` → proxy a `gateway:3001` (PRM en la raíz del dominio).
   - `= /api/mcp/.well-known/oauth-protected-resource` → proxy a `gateway:3001/.well-known/oauth-protected-resource` con cabecera `X-MCP-Resource-URL: https://mcp.domoticore.co/api/mcp` (para que ChatGPT reciba el PRM con `resource` igual a la URL del MCP).
   - `/api/` → rewrite a `/$1` y proxy a `gateway:3001`.
   - `/` → proxy a `webapp:3000`.

3. **HTTPS – `server_name auth.domoticore.co`:**
   - Certificados: `auth.domoticore.co` (Let's Encrypt o autofirmado).
   - `= /realms/mcp/clients-registrations/openid-connect` → proxy a `gateway:3001` (DCR en el gateway).
   - `/` → proxy a `keycloak:8080`.

**Archivo auxiliar:** `nginx/nginx-no-auth.conf`: misma lógica pero solo el bloque de `mcp.domoticore.co` (sin bloque de `auth.domoticore.co`), para poder levantar el stack antes de tener certificado para auth.

---

### Fase 3: Certificado para auth.domoticore.co

**Objetivo:** TLS para `auth.domoticore.co` (Let's Encrypt o, temporalmente, autofirmado).

**Scripts:**

- **`scripts/obtain-auth-cert.ps1`** (Windows): ejecuta certbot para `auth.domoticore.co`. Uso: `.\scripts\obtain-auth-cert.ps1 -Email "tu@email.com"`. Requiere DNS de `auth.domoticore.co` apuntando al host y puerto 80 accesible.
- **`scripts/ec2/create-selfsigned-auth-cert.sh`** (EC2): crea certificado autofirmado en el volumen `letsencrypt` con la misma estructura que Let's Encrypt (`/etc/letsencrypt/live/auth.domoticore.co/`), para poder usar nginx con el bloque de auth antes de tener cert real.

**Nota:** Si Let's Encrypt genera `auth.domoticore.co-0001`, hay que actualizar las rutas de certificado en `nginx.conf` para ese bloque y reiniciar nginx.

---

### Fase 4: Realm y usuario en Keycloak

**Objetivo:** Realm `mcp` y usuario de prueba para login desde ChatGPT.

**Scripts:**

- **`scripts/keycloak-setup-realm.ps1`** (Windows): usa `kcadm.sh` dentro del contenedor para crear realm `mcp` y usuario `mcp-test`, y asignar contraseña (por defecto `change-me-mcp-test` o `$env:MCP_TEST_USER_PASSWORD`).
- **`scripts/ec2/keycloak-setup-realm.sh`** (Linux/EC2): equivalente en bash. En EC2 el password de admin debe pasarse en el comando (variable en sesión) porque el `.env` puede tener caracteres que rompen en subshell.

**Resultado:** Realm `mcp` habilitado; usuario `mcp-test` con password configurable, para usar en el flujo OAuth (login en Keycloak cuando ChatGPT redirige a auth.domoticore.co).

---

### Fase 5: Gateway – PRM, auth Keycloak y proxy DCR

**Objetivo:** Que el gateway exponga el PRM (RFC 9728), acepte tokens de Keycloak además de API key y Cognito, y actúe como proxy DCR ante Keycloak.

**5.1 OAuth Protected Resource Metadata (PRM)**

**Archivo:** `gateway/src/index.ts`.

- **Ruta:** `GET /.well-known/oauth-protected-resource`.
- **Respuesta:** JSON con `resource` y `authorization_servers` (array con `KEYCLOAK_PUBLIC_URL`).
- **Content-Type:** `application/json`.
- **Lógica:** Si llega la cabecera `X-MCP-Resource-URL` (enviada por nginx para la ruta `/api/mcp/.well-known/...`), se usa como `resource`; si no, se usa `MCP_OAUTH_RESOURCE` o un valor por defecto. Así ChatGPT recibe `resource: "https://mcp.domoticore.co/api/mcp"` cuando pide la configuración OAuth desde esa URL.

**5.2 Autenticación: API key + Cognito + Keycloak**

**Archivo:** `gateway/src/auth/jwt.ts`.

- Sigue aceptando **API key** (Bearer `MCP_API_KEY`) y **JWT de Cognito** (JWKS de Cognito, issuer/audience).
- **Nuevo:** Acepta **access tokens de Keycloak** (realm `KEYCLOAK_REALM`, issuer `KEYCLOAK_PUBLIC_URL/realms/KEYCLOAK_REALM`, JWKS en `.../protocol/openid-connect/certs`).
- Flujo: se decodifica el JWT para leer `iss`; si es el issuer de Keycloak se valida con JWKS de Keycloak; si es el de Cognito, con JWKS de Cognito; si no coincide ninguno se intenta Cognito y luego Keycloak como fallback.
- Las rutas protegidas (`/mcp`, `/logs`, etc.) siguen usando el middleware `requireJwt`; no se añadieron rutas extra, solo fuentes de token.

**5.3 Proxy DCR (Dynamic Client Registration)**

**Archivo nuevo:** `gateway/src/dcr-proxy.ts`.

- **Ruta:** `POST /realms/mcp/clients-registrations/openid-connect` (recibida por nginx en auth.domoticore.co y reenviada al gateway).
- **Autorización:** `Authorization: Bearer <MCP_DCR_REG_SECRET>`.
- **Cuerpo:** JSON con `redirect_uris`, `client_name`, `scope`, opcionalmente `client_id`.
- **Validación:** `redirect_uris` debe ser HTTPS y estar dentro de los prefijos permitidos (`MCP_DCR_ALLOWED_REDIRECT_PREFIXES`, por defecto `https://chat.openai.com`).
- **Flujo:** Obtiene token de admin de Keycloak (`/realms/master/protocol/openid-connect/token` con `grant_type=password`, `client_id=admin-cli`). Crea el cliente en el realm `mcp` vía Admin API (`POST .../admin/realms/mcp/clients`) con `publicClient: true`, PKCE S256, `redirectUris`, etc. Responde con un JSON tipo DCR: `client_id`, `redirect_uris`, `client_name`, `scope`, `registration_client_uri`.

**Archivo:** `gateway/src/index.ts`: registro de la ruta POST que llama a `handleDcrRegistration`.

**Variables usadas en gateway (además de las de .env raíz):** `KEYCLOAK_INTERNAL_URL` (en compose: `http://keycloak:8080`) para llamar a Keycloak desde el contenedor.

---

### Fase 6: Build y despliegue

**Comandos típicos:**

- Build gateway: `npm run build` en `gateway/`.
- Levantar stack: `docker compose up -d --build`.
- En EC2: después de `git pull`, `docker compose build gateway nginx && docker compose up -d --force-recreate gateway nginx` (o el conjunto de servicios que uses).

---

### Fase 7: Pruebas con curl

**Endpoints a verificar:**

- PRM (raíz): `curl -s https://mcp.domoticore.co/.well-known/oauth-protected-resource`
- PRM (para ChatGPT): `curl -s https://mcp.domoticore.co/api/mcp/.well-known/oauth-protected-resource` → debe devolver `resource: "https://mcp.domoticore.co/api/mcp"`.
- Health: `curl -s https://mcp.domoticore.co/api/health`
- OIDC Keycloak: `curl -s https://auth.domoticore.co/realms/mcp/.well-known/openid-configuration`
- DCR: `POST https://auth.domoticore.co/realms/mcp/clients-registrations/openid-connect` con `Authorization: Bearer <MCP_DCR_REG_SECRET>` y body JSON con `redirect_uris`, `client_name`, `scope`.
- Token de prueba: `POST https://auth.domoticore.co/realms/mcp/protocol/openid-connect/token` (grant_type=password, client_id del realm, usuario mcp-test).
- Llamada al MCP: `POST https://mcp.domoticore.co/api/mcp` con `Authorization: Bearer <access_token>` y body JSON-RPC (ej. `tools/list`).

---

### Fase 8: Conexión en ChatGPT (manual)

**Pasos resumidos:**

1. En ChatGPT: Configuración → Apps y conectores → Activar modo desarrollador.
2. Crear conector: URL del servidor MCP = `https://mcp.domoticore.co/api/mcp`, autenticación OAuth.
3. ChatGPT descubre el PRM en `https://mcp.domoticore.co/api/mcp/.well-known/oauth-protected-resource`, obtiene `authorization_servers` (Keycloak) y puede usar DCR y el flujo OAuth con PKCE.
4. Cuando pida login, usar usuario/contraseña del realm `mcp` (ej. `mcp-test` / `change-me-mcp-test`).

**Documento:** `docs/CHATGPT-CONEXION-MCP-OAUTH.md` con los pasos detallados y troubleshooting.

---

## Fixes críticos para ChatGPT (aplicados)

- **PRM:** `authorization_servers` devuelve el **issuer del realm** (`https://auth.domoticore.co/realms/mcp`), no la URL base de Keycloak.
- **DCR:** No se exige `MCP_DCR_REG_SECRET`; ChatGPT no envía Bearer en el registro. Validación por allowlist de `redirect_uris` (chatgpt.com/connector/oauth/ y connector_platform_oauth_redirect), `grant_types` = `["authorization_code"]` y `token_endpoint_auth_method` = `"none"`. Respuesta 201 con `client_id`, `redirect_uris`, `grant_types`, `response_types`, `token_endpoint_auth_method`.
- **Resource:** PRM devuelve `resource` = `https://mcp.domoticore.co/api/mcp` cuando la petición llega con header `X-MCP-Resource-URL` (ruta `/api/mcp/.well-known/oauth-protected-resource`).

---

## Archivos creados o modificados (listado)

| Archivo | Cambio |
|---------|--------|
| `.env` | Añadidas variables Keycloak y OAuth (Fase 0). |
| `.gitignore` | Añadidos `scripts/ec2/keycloak-env-append.txt` y `scripts/ec2/reset-keycloak-password.sql` para no subir secretos. |
| `docker-compose.yml` | Servicio `keycloak`; `KEYCLOAK_INTERNAL_URL` en gateway; nginx depende de keycloak. |
| `nginx/nginx.conf` | Dos server HTTPS (mcp.domoticore.co, auth.domoticore.co); location PRM raíz; location `/api/mcp/.well-known/oauth-protected-resource` con header `X-MCP-Resource-URL`; location DCR a gateway; resto auth a keycloak. |
| `nginx/nginx-no-auth.conf` | Misma lógica que mcp.domoticore.co (sin bloque auth), para despliegue sin cert de auth. |
| `gateway/src/index.ts` | GET `/.well-known/oauth-protected-resource` (PRM con resource por header); POST `/realms/mcp/clients-registrations/openid-connect` → DCR. |
| `gateway/src/auth/jwt.ts` | Soporte Keycloak: issuer, JWKS, verificación de access tokens; `requireJwt` acepta API key, Cognito o Keycloak. |
| `gateway/src/dcr-proxy.ts` | Nuevo: lógica DCR (token admin, creación de cliente en Keycloak, respuesta DCR). |
| `scripts/create-keycloak-db.ps1` | Crear DB y usuario keycloak en Postgres (Windows). |
| `scripts/keycloak-setup-realm.ps1` | Crear realm mcp y usuario mcp-test (Windows). |
| `scripts/obtain-auth-cert.ps1` | Certbot para auth.domoticore.co (Windows). |
| `scripts/ec2/create-keycloak-db.sh` | Crear DB keycloak (Linux/EC2). |
| `scripts/ec2/keycloak-setup-realm.sh` | Realm y usuario en Keycloak (EC2). |
| `scripts/ec2/create-selfsigned-auth-cert.sh` | Cert autofirmado para auth.domoticore.co en volumen letsencrypt. |
| `scripts/ec2/keycloak-env-append.txt` | Bloque de variables para añadir a .env en EC2 (no subir al repo). |
| `scripts/ec2/reset-keycloak-password.sql` | ALTER ROLE keycloak password (uso puntual). |
| `scripts/ec2/recreate-keycloak-db.sql` | DROP/CREATE database keycloak (uso puntual). |
| `scripts/ec2/dcr-body.json` | Body de ejemplo para probar DCR con curl. |
| `docs/KEYCLOAK-OAUTH-DEPLOY.md` | Orden de ejecución, tests curl, Fase 8 resumida. |
| `docs/CHATGPT-CONEXION-MCP-OAUTH.md` | Guía paso a paso para conectar en ChatGPT. |

---

## URLs de referencia

| Uso | URL |
|-----|-----|
| MCP (ChatGPT) | `https://mcp.domoticore.co/api/mcp` |
| PRM (raíz) | `https://mcp.domoticore.co/.well-known/oauth-protected-resource` |
| PRM (ChatGPT) | `https://mcp.domoticore.co/api/mcp/.well-known/oauth-protected-resource` |
| Health gateway | `https://mcp.domoticore.co/api/health` |
| Keycloak (auth) | `https://auth.domoticore.co` |
| OIDC discovery realm mcp | `https://auth.domoticore.co/realms/mcp/.well-known/openid-configuration` |
| DCR | `POST https://auth.domoticore.co/realms/mcp/clients-registrations/openid-connect` |
| Token realm mcp | `POST https://auth.domoticore.co/realms/mcp/protocol/openid-connect/token` |

---

## Flujo OAuth (ChatGPT → Keycloak → MCP)

1. Usuario en ChatGPT añade conector con URL `https://mcp.domoticore.co/api/mcp` y OAuth.
2. ChatGPT solicita `https://mcp.domoticore.co/api/mcp/.well-known/oauth-protected-resource` y recibe `resource` y `authorization_servers: ["https://auth.domoticore.co"]`.
3. ChatGPT obtiene la configuración OIDC de Keycloak (p. ej. `https://auth.domoticore.co/realms/mcp/.well-known/openid-configuration`).
4. ChatGPT hace DCR a `https://auth.domoticore.co/realms/mcp/clients-registrations/openid-connect` (Bearer `MCP_DCR_REG_SECRET`); el gateway crea el cliente en Keycloak y devuelve `client_id`, etc.
5. ChatGPT inicia el flujo OAuth con PKCE: redirige al usuario a Keycloak para login (realm mcp, usuario p. ej. mcp-test).
6. Tras el login, Keycloak redirige a ChatGPT con un código; ChatGPT canjea el código por access_token.
7. ChatGPT llama a `POST https://mcp.domoticore.co/api/mcp` con `Authorization: Bearer <access_token>`; el gateway valida el token con JWKS de Keycloak y atiende la petición MCP.

---

*Documento generado como resumen del plan Keycloak + OAuth (PKCE + DCR) para MCP y ChatGPT.*
