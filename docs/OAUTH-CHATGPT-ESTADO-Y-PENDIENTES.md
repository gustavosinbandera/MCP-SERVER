# OAuth ChatGPT: lo que se arregló y lo que sigue sin resolver

**Fecha:** Febrero 2025  
**Servidor MCP:** `https://mcp.domoticore.co/api/mcp`  
**Auth:** Keycloak (realm `mcp`) + DCR + PKCE

**Estado discovery HTTPS:** Config actualizada con Keycloak **hostname v2** (sin KC_PROXY) y headers proxy en nginx. **Importante:** Si auth.domoticore.co sigue con cert **autofirmado**, ChatGPT no conecta; hay que poner Let's Encrypt real. Runbook: **docs/runbook_tls_https_keycloak_for_chatgpt.md**.

---

## 1. Comportamiento actual en ChatGPT

| Opción en ChatGPT | Resultado |
|-------------------|-----------|
| **Autenticación: OAuth** | Mensaje: *"El servidor MCP no implementa OAuth"* / *"MCP server … does not implement OAuth"*. |
| **Sin autenticación** | El servidor responde **401** con *"Missing Authorization header"* (comportamiento correcto del gateway). |

Es decir: el flujo OAuth **sigue sin ser detectado** por ChatGPT; sin auth, el servidor exige cabecera de autorización como está diseñado.

---

## 2. Lo que ya se arregló (últimos cambios)

### 2.1 URL de metadata según RFC 9728

Para el recurso `https://mcp.domoticore.co/api/mcp`, la norma **RFC 9728** define la URL de metadata OAuth así:

- **Correcto:**  
  `https://mcp.domoticore.co/.well-known/oauth-protected-resource/api/mcp`  
  (se inserta `/.well-known/oauth-protected-resource` entre el host y el path).

- **Incorrecto (lo que se asumía antes):**  
  `https://mcp.domoticore.co/api/mcp/.well-known/oauth-protected-resource`

**Cambios hechos:**

- **Nginx:** Se añadió la ruta exacta  
  `location = /.well-known/oauth-protected-resource/api/mcp`  
  que hace proxy al gateway con el header `X-MCP-Resource-URL: https://mcp.domoticore.co/api/mcp`.
- **Gateway:** La ruta del PRM acepta tanto `/.well-known/oauth-protected-resource` como `/.well-known/oauth-protected-resource/api/mcp`.

**Comprobación desde fuera:**

```bash
curl -s https://mcp.domoticore.co/.well-known/oauth-protected-resource/api/mcp
```

**Respuesta esperada:**

```json
{
  "resource": "https://mcp.domoticore.co/api/mcp",
  "authorization_servers": ["https://auth.domoticore.co/realms/mcp"]
}
```

Esto **sí responde correctamente** en el servidor actual.

---

### 2.2 Cabecera 401 con `resource_metadata` (RFC 9728)

Para que un cliente pueda descubrir la metadata OAuth a partir de un 401, el recurso puede enviar en la respuesta 401 la cabecera:

`WWW-Authenticate: Bearer resource_metadata="<url_metadata>"`

**Cambio hecho:**

- En **gateway** (`auth/jwt.ts`), cuando se devuelve **401** (sin token o token inválido), se envía:
  - `WWW-Authenticate: Bearer resource_metadata="https://mcp.domoticore.co/.well-known/oauth-protected-resource/api/mcp"`

Así, si ChatGPT primero llama al MCP sin token y recibe 401, puede usar esa URL para obtener el PRM y continuar el flujo OAuth.

---

### 2.3 Resumen de fixes anteriores (ya desplegados)

- **PRM:** `authorization_servers` usa el **issuer del realm** (`https://auth.domoticore.co/realms/mcp`), no solo la URL base de Keycloak.
- **DCR:** Sin exigencia de secret; allowlist de `redirect_uris` para `https://chatgpt.com/connector/oauth/` y variantes; validación de `grant_types` y `token_endpoint_auth_method`.
- **DNS:** Registro A de `auth.domoticore.co` en Route 53 apuntando a la EC2.
- **Ruta PRM:** Disponible tanto en la URL “raíz” como en la URL con path según RFC 9728.

---

## 3. Lo que aún no se resuelve

### 3.1 ChatGPT sigue mostrando “el servidor no implementa OAuth”

A pesar de que:

- La URL  
  `https://mcp.domoticore.co/.well-known/oauth-protected-resource/api/mcp`  
  devuelve el JSON correcto con `resource` y `authorization_servers`.
- El 401 incluye `resource_metadata` con esa misma URL.

**Posibles causas (a investigar):**

1. **Orden o forma en que ChatGPT descubre OAuth:**  
   Puede que ChatGPT no use exactamente la URL RFC 9728 o que espere otro path (por ejemplo seguir usando `.../api/mcp/.well-known/oauth-protected-resource`). No está documentado de forma pública el algoritmo exacto que usa ChatGPT para “implementa OAuth”.
2. **Certificado de `auth.domoticore.co` (causa comprobada si es autofirmado):**  
   Si el certificado es autofirmado (`issuer=CN=auth.domoticore.co`), la infra de ChatGPT **no lo acepta** y no llega tráfico (no hay logs en auth). Solución: **Let's Encrypt real** en auth.domoticore.co. Ver **docs/runbook_tls_https_keycloak_for_chatgpt.md**.
3. **CORS o cabeceras:**  
   Alguna restricción de cabeceras o CORS en el PRM o en el 401 que haga que el cliente de ChatGPT no use la respuesta.
4. **Cambios recientes de producto:**  
   La UI o el flujo de conectores de ChatGPT pueden haber cambiado; conviene revisar la documentación o guías más recientes de “MCP + OAuth” para ChatGPT.

### 3.2 “Missing Authorization header” sin autenticación

Esto **no es un bug**: el gateway está configurado para exigir `Authorization: Bearer <token>` en las rutas MCP. Si en ChatGPT se deja “sin autenticación”, las peticiones llegan sin cabecera y el servidor responde 401 con “Missing Authorization header”. Es el comportamiento esperado hasta que el flujo OAuth se complete y ChatGPT envíe el token.

---

## 4. URLs útiles para depuración

| Comprobación | URL o comando |
|--------------|----------------|
| PRM (URL RFC 9728) | `https://mcp.domoticore.co/.well-known/oauth-protected-resource/api/mcp` |
| PRM (ruta alternativa) | `https://mcp.domoticore.co/api/mcp/.well-known/oauth-protected-resource` |
| Health del gateway | `https://mcp.domoticore.co/api/health` |
| OIDC discovery Keycloak | `https://auth.domoticore.co/realms/mcp/.well-known/openid-configuration` |
| DCR (desde EC2 o con cert aceptado) | `POST https://auth.domoticore.co/realms/mcp/clients-registrations/openid-connect` con body JSON (redirect_uris, grant_types, etc.) |
| 401 con resource_metadata | `curl -i -X POST https://mcp.domoticore.co/api/mcp -H "Content-Type: application/json" -d "{}"` → debe incluir cabecera `WWW-Authenticate` con `resource_metadata=`. |

---

## 4.1 Fixes aplicados (PRM root + proxy discovery en host) — Feb 2025

Para mitigar “does not implement OAuth” se aplicó lo siguiente (según doc de fixes precisos):

- **PRM root:** `GET https://mcp.domoticore.co/.well-known/oauth-protected-resource` devuelve `resource: "https://mcp.domoticore.co"` (origen/host, sin `/api/mcp`), `authorization_servers` y `scopes_supported: ["mcp:tools", "mcp:invoke"]`. Variable opcional: `MCP_OAUTH_RESOURCE_ROOT=https://mcp.domoticore.co`.
- **Nginx:** Location exacta `= /.well-known/oauth-protected-resource` al gateway (sin header de resource URL para que responda root). Proxy de `/.well-known/openid-configuration` y `/.well-known/oauth-authorization-server` al Keycloak realm (en el host MCP) por si el connector los pide ahí.
- **WWW-Authenticate:** En 401 se envía `resource_metadata="https://mcp.domoticore.co/.well-known/oauth-protected-resource"` y `scope="mcp:tools"`.
- **Logs:** Access log en nginx (formato `mcp`) para ver qué pide ChatGPT: `docker logs -f mcp-nginx | grep -E 'well-known|openid|oauth|clients-registrations|mcp'`.

**Tests tras deploy:** PRM root OK, openid-configuration en host OK, DCR 201 OK, 401 con header OK.

### Fix "Failed to resolve OAuth client" (DCR GET registration_client_uri)

- **Nginx:** `location ^~ /realms/mcp/clients-registrations/openid-connect` (prefijo) para que POST y GET `.../openid-connect/<client_id>` vayan al gateway.
- **Gateway:** POST DCR devuelve `registration_access_token` y `registration_client_uri`; store in-memory por `client_id`. GET `.../openid-connect/:clientId` (con o sin trailing slash) con `Authorization: Bearer <registration_access_token>` devuelve 200 con el registro. CORS explícito (Allow-Methods, Allow-Headers) para peticiones desde el connector.
- **Según doc oficial (developers.openai.com/apps-sdk/build/auth):** ChatGPT se registra por DCR en el `registration_endpoint`, obtiene `client_id`, y debe poder usar el flujo OAuth. Si el GET al `registration_client_uri` falla (TLS, 401, 404, timeout), aparece “Failed to resolve OAuth client”.

**Análisis de logs:** ChatGPT (Python aiohttp) solo llama a mcp.domoticore.co; no hay peticiones a auth.domoticore.co. Pide discovery en rutas con sufijo `/api/mcp` que devolvían 404; nginx ahora sirve esas 4 URLs (mismo discovery). Revisar que Keycloak devuelva https en issuer/registration_endpoint.

### Discovery con HTTPS (issuer y registration_endpoint)

Para que ChatGPT no rechace el discovery por URLs en `http`:

- **Keycloak:** En Keycloak 26 se usa `KC_HOSTNAME: https://auth.domoticore.co` (URL completa), `KC_HOSTNAME_STRICT: "false"` y `KC_PROXY_HEADERS: xforwarded` para que el discovery devuelva siempre `issuer` y `registration_endpoint` con **https**. Requiere recrear el contenedor Keycloak (`docker compose up -d keycloak`) tras el cambio.
- **Nginx:** En todas las locations de discovery (mcp.domoticore.co) se añadió `proxy_set_header X-Forwarded-Host auth.domoticore.co` junto a `X-Forwarded-Proto https` para que Keycloak construya bien las URLs.

**Tras desplegar:** Comprobar que la respuesta de discovery tenga `https`:
```bash
curl -s https://mcp.domoticore.co/.well-known/openid-configuration | jq '.issuer, .registration_endpoint'
# Debe mostrar https://auth.domoticore.co/realms/mcp y https://auth.domoticore.co/realms/mcp/clients-registrations/openid-connect
```

**Si el error continúa:**

1. **Ver qué llama ChatGPT:** En EC2, mientras pulsas “Crear” en ChatGPT, ejecuta:
   ```bash
   docker logs -f mcp-nginx 2>&1 | grep -E 'clients-registrations|oauth-protected|openid'
   ```
   Deberías ver `POST .../openid-connect 201` y luego `GET .../openid-connect/<client_id> 200`. Si ves GET 401/404 o no ves el GET, el fallo está ahí (token no enviado, store vacío, o TLS rechazado).

2. **Certificado TLS de auth.domoticore.co:** Si el cert es autofirmado, la infra de ChatGPT puede rechazar la conexión al `registration_client_uri` (https://auth.domoticore.co/...) y no llegar al servidor. Solución: certificado válido (p. ej. Let's Encrypt) para `auth.domoticore.co`.

3. **Plan B – Cliente fijo (sin DCR):** Crear en Keycloak un cliente público con redirect URIs `https://chatgpt.com/connector/oauth/*` y `https://chatgpt.com/connector_platform_oauth_redirect`. En ChatGPT, en “ID de cliente de OAuth (opcional)” pegar ese `client_id`; “Secreto” vacío. Así ChatGPT no usa DCR y no necesita resolver el cliente.

---

## 5. Próximos pasos recomendados

1. **~~Desplegar y comprobar discovery HTTPS~~** (hecho 24 feb 2025)  
   Keycloak con `KC_HOSTNAME: https://auth.domoticore.co` y nginx con `X-Forwarded-Host` desplegados en EC2; el discovery ya devuelve https. **Siguiente:** probar de nuevo el conector OAuth en ChatGPT.
2. **Certificado válido para `auth.domoticore.co`**  
   Obtener certificado (p. ej. Let's Encrypt) para `auth.domoticore.co` y usarlo en nginx, para descartar fallos por certificado autofirmado en discovery/DCR/token.
3. **Documentación y soporte de OpenAI/ChatGPT**  
   Revisar la documentación actual de “Building MCP servers for ChatGPT” y “Authentication” (OpenAI), y si existe soporte o foro, preguntar por el flujo exacto de descubrimiento OAuth (qué URL se consulta y qué cabeceras/respuestas se esperan).
4. **Logs y red**  
   En la EC2, revisar logs de nginx y del gateway cuando se intenta crear el conector con OAuth (qué URLs recibe el servidor y qué responde) para ver si ChatGPT llama a la URL RFC 9728 o a otra.
5. **Mantener ambas rutas PRM**  
   Dejar servidas tanto la URL RFC 9728 como la ruta bajo `/api/mcp/.well-known/oauth-protected-resource` por compatibilidad con clientes que no sigan estrictamente la norma.

---

## 6. Resumen en una frase

**Arreglado:** PRM en la URL correcta según RFC 9728 y 401 con `resource_metadata`; DCR sin secret; DNS y issuer del realm.  
**Pendiente:** Que ChatGPT deje de mostrar “el servidor no implementa OAuth” (posibles causas: certificado de auth, forma de discovery o cambios de producto). El mensaje “Missing Authorization header” sin auth es el comportamiento correcto del servidor.
