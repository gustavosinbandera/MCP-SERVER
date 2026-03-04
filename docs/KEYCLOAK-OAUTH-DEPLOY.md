# Despliegue Keycloak + OAuth (DCR) para MCP y ChatGPT

Resumen del plan ejecutado: variables, servicios, nginx, gateway (PRM + auth Keycloak + DCR proxy) y pasos para conectar en ChatGPT.

---

## Orden de ejecución (en servidor / EC2)

1. **Variables** (Fase 0)  
   Ya están en `.env`: `KEYCLOAK_*`, `MCP_DCR_REG_SECRET`, `MCP_OAUTH_RESOURCE`, `KEYCLOAK_PUBLIC_URL`, `MCP_GATEWAY_URL`, etc.

2. **Base de datos Keycloak** (Fase 1)  
   Con Docker levantado:
   ```powershell
   .\scripts\create-keycloak-db.ps1
   ```

3. **Certificado auth.domoticore.co** (Fase 3)  
   DNS de `auth.domoticore.co` debe apuntar a esta máquina; puerto 80 accesible.
   ```powershell
   .\scripts\obtain-auth-cert.ps1 -Email "tu@email.com"
   ```
   Si Let's Encrypt crea `auth.domoticore.co-0001`, edita `nginx/nginx.conf` y cambia las rutas de certificado del bloque `auth.domoticore.co` a `.../live/auth.domoticore.co-0001/...`, luego reinicia nginx.

4. **Build y arranque**
   ```powershell
   docker compose up -d --build
   ```
   Nginx puede fallar si el cert de auth no existe aún; en ese caso obtener el cert (paso 3) y luego `docker compose up -d` de nuevo.

5. **Realm y usuario en Keycloak** (Fase 4)  
   Cuando Keycloak esté listo:
   ```powershell
   .\scripts\keycloak-setup-realm.ps1
   ```
   Opcional: `$env:MCP_TEST_USER_PASSWORD = "tu-password"; .\scripts\keycloak-setup-realm.ps1`

6. **Tests con curl** (Fase 7)  
   - PRM: `curl -s https://mcp.domoticore.co/.well-known/oauth-protected-resource`
   - OIDC discovery Keycloak: `curl -s https://auth.domoticore.co/realms/mcp/.well-known/openid-configuration`
   - DCR (sustituir `MCP_DCR_REG_SECRET` por el valor de `.env`):
     ```bash
     curl -s -X POST https://auth.domoticore.co/realms/mcp/clients-registrations/openid-connect \
       -H "Authorization: Bearer MCP_DCR_REG_SECRET" \
       -H "Content-Type: application/json" \
       -d '{"redirect_uris":["https://chat.openai.com/"],"client_name":"ChatGPT MCP","scope":"openid"}'
     ```
   - Token de prueba (realm mcp, usuario mcp-test):
     ```bash
     curl -s -X POST https://auth.domoticore.co/realms/mcp/protocol/openid-connect/token \
       -d "grant_type=password&client_id=REALM_CLIENT_ID&username=mcp-test&password=TU_PASSWORD"
     ```
   - Llamar al gateway con ese access_token:
     ```bash
     curl -s -X POST https://mcp.domoticore.co/api/mcp \
       -H "Authorization: Bearer ACCESS_TOKEN" \
       -H "Content-Type: application/json" \
       -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
     ```

---

## Conectar en ChatGPT (Fase 8 – manual)

1. En ChatGPT, añadir un conector / MCP que use **OAuth con PKCE**.
2. URL del recurso MCP: `https://mcp.domoticore.co` (o la URL que devuelva PRM).
3. Cuando ChatGPT pida “Authorization server”, usar la URL que devuelve PRM: `https://auth.domoticore.co`.
4. El flujo hará DCR contra `https://auth.domoticore.co/realms/mcp/clients-registrations/openid-connect` (nginx reenvía al gateway), luego login en Keycloak (realm mcp, usuario p. ej. mcp-test) y llamadas a `https://mcp.domoticore.co/api/mcp` con el access token de Keycloak.
5. En Keycloak Admin (`https://auth.domoticore.co`) crear si hace falta un client público para el realm `mcp` con PKCE (S256) y redirect URIs de ChatGPT; o dejar que DCR cree el cliente al conectar.

---

## Archivos tocados

- **.env**: variables Keycloak y OAuth.
- **docker-compose.yml**: servicio `keycloak`, `KEYCLOAK_INTERNAL_URL` en gateway, nginx depende de keycloak.
- **nginx/nginx.conf**: dos `server` (SNI): mcp.domoticore.co y auth.domoticore.co; DCR proxy a gateway.
- **gateway**: ruta `GET /.well-known/oauth-protected-resource` (PRM), `POST /realms/mcp/clients-registrations/openid-connect` (DCR), auth en `jwt.ts` (API key + Cognito + Keycloak), `dcr-proxy.ts`.
