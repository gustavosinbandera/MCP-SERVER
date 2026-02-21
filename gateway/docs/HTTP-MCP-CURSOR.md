# MCP sobre HTTP Streamable para Cursor (v1)

El gateway expone MCP por HTTP en el endpoint `/mcp`, protegido por JWT (Cognito). Cursor puede conectarse usando el tipo **streamable-http** con la URL del gateway y el header `Authorization: Bearer <token>`.

## Obtener token Cognito (manual)

1. **Usuario/contraseña (User Pool):**  
   Usa el flujo de login de tu app (p. ej. Hosted UI de Cognito o API `InitiateAuth` con `USER_PASSWORD_AUTH`). La respuesta incluye `IdToken` (o `AccessToken`). Usa el **IdToken** como Bearer para `/mcp`.

2. **Desde AWS CLI (ejemplo):**  
   Si tienes un Client ID y usuario/contraseña configurados:
   ```bash
   aws cognito-idp initiate-auth \
     --auth-flow USER_PASSWORD_AUTH \
     --client-id <COGNITO_APP_CLIENT_ID> \
     --auth-parameters USERNAME=<user>,PASSWORD=<pass> \
     --query 'AuthenticationResult.IdToken' --output text
   ```

3. **Desde la app web:**  
   Si ya usas Cognito en el frontend (Amplify, etc.), obtén el IdToken de la sesión actual y pásalo a Cursor (por ejemplo copiándolo temporalmente en la config).

## Configuración de Cursor (mcp.json)

Ejemplo de configuración para un servidor MCP por HTTP Streamable:

```json
{
  "mcpServers": {
    "knowledge-hub-remote": {
      "url": "https://mcp.domoticore.co/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer <TU_ID_TOKEN_COGNITO>"
      }
    }
  }
}
```

- **url**: Base URL del gateway + `/mcp` (sin barra final).
- **transport**: `streamable-http`.
- **headers**: Incluye `Authorization: Bearer <id_token>`. Sustituye `<TU_ID_TOKEN_COGNITO>` por el token actual (hay que renovarlo cuando expire).

## Variables de entorno del gateway (Cognito)

En el servidor (o `.env` del gateway) configura:

- `COGNITO_REGION`: Región del User Pool (ej. `us-east-1`).
- `COGNITO_USER_POOL_ID`: ID del User Pool.
- `COGNITO_APP_CLIENT_ID`: Client ID de la app (opcional si no validas audience).
- Opcional: `COGNITO_ISSUER` y `COGNITO_JWKS_URL` si usas issuer/URL de JWKS explícitos.

## Sesiones y límites

- Cada usuario (JWT `sub`) tiene sus propias sesiones MCP.
- **MAX_SESSIONS_PER_USER** (default 3): máximo de sesiones activas por usuario. Si se supera, la respuesta es **429** con mensaje claro. Las peticiones **sin** header `mcp-session-id` reutilizan la sesión más reciente del usuario (evita que reintentos o múltiples conexiones del cliente llenen el límite).
- **SESSION_TTL_MS** (default 30 min): sesiones inactivas se cierran automáticamente; un timer cada 60 s limpia las expiradas.
- El cliente puede enviar el header **mcp-session-id** para reutilizar una sesión (el servidor lo devuelve en la respuesta al crear una nueva).
- **DELETE /mcp** con header `mcp-session-id` cierra esa sesión (respuesta 204 si existía, 404 si no).

## Troubleshooting

| Problema | Causa habitual | Qué hacer |
|----------|----------------|-----------|
| **401** sin body / "Missing Authorization" | No envías header `Authorization: Bearer <token>`. | Añade en `mcp.json` el header con el IdToken de Cognito. |
| **401** "Invalid or expired token" | Token caducado, firma inválida o issuer/audience incorrectos. | Renueva el token (login de nuevo). Comprueba COGNITO_* en el servidor. |
| **429** / "Maximum sessions per user" | Ya tienes MAX_SESSIONS_PER_USER sesiones abiertas. | Cierra sesiones (DELETE /mcp con cada mcp-session-id) o espera al TTL. |
| **405** en GET /mcp | GET no se usa para JSON-RPC. | Usa POST /mcp para las peticiones MCP (initialize, tools/list, etc.). |
| Cursor no lista tools | URL incorrecta o token no enviado. | Verifica que la URL sea `https://.../mcp` y que el header Authorization llegue (logs del gateway si tienes acceso). |

## Comandos de verificación

- Health del gateway: `curl https://mcp.domoticore.co/health`
- Sin token (debe dar 401): `curl -X POST https://mcp.domoticore.co/mcp -H "Content-Type: application/json" -d "{}"`
- Con token (initialize):  
  `curl -X POST https://mcp.domoticore.co/mcp -H "Content-Type: application/json" -H "Authorization: Bearer <ID_TOKEN>" -d "{\"jsonrpc\":\"2.0\",\"method\":\"initialize\",\"id\":1,\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1.0.0\"}}}"`
