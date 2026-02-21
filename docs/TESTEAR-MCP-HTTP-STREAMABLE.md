# Qué te hace falta para testear MCP por HTTP streamable

Checklist mínimo para probar `POST /mcp` (JWT + JSON-RPC) desde tu máquina o desde Cursor.

**Usuario de prueba (ya creado en Cognito):** `mcp-test@domoticore.co` — usa su contraseña para obtener IdToken (AWS CLI o Hosted UI) y probar Cursor.

---

## 1. Cognito listo (User Pool + usuario)

- [ ] **Stack con Cognito:** Creaste o actualizaste el stack con `CognitoCreateUserPool=true` y tienes los **Outputs**: `CognitoUserPoolId`, `CognitoAppClientId`, `CognitoRegion`.
- [ ] **Usuario en el User Pool:** En AWS Console → Cognito → User Pools → *mcp-knowledge-hub-users* → **Users** → **Create user**:
  - Email: el que usarás para login.
  - Contraseña temporal (marca “Send an email invitation” o asigna contraseña y que el usuario la cambie después).
- [ ] **`.env` en la EC2:** En la instancia, en `~/MCP-SERVER/.env` (o el `.env` que use el gateway) tienes:
  ```bash
  COGNITO_REGION=<valor del output CognitoRegion>
  COGNITO_USER_POOL_ID=<valor del output CognitoUserPoolId>
  COGNITO_APP_CLIENT_ID=<valor del output CognitoAppClientId>
  ```
- [ ] **Reinicio del gateway:** Tras tocar `.env`, en la EC2:  
  `docker compose restart gateway`

---

## 2. Obtener un IdToken (para el Bearer)

Tienes que tener **un token válido** (IdToken de Cognito). Opciones:

**A) Script con Refresh Token (recomendado para test ~2 meses)**

El **RefreshToken** de Cognito puede durar **60 días**. Una vez que lo obtienes, no necesitas volver a poner contraseña durante ese tiempo.

1. **Primera vez** (solo una vez cada ~2 meses):
   ```powershell
   cd C:\PROYECTOS\MCP-SERVER
   .\scripts\get-mcp-id-token.ps1 -Login
   ```
   Te pide email y contraseña. Imprime el IdToken y guarda el RefreshToken en `%USERPROFILE%\.mcp-cognito-refresh`.

2. **Cada vez que necesites un IdToken nuevo** (p. ej. cuando caduque a la hora, o para actualizar Cursor):
   ```powershell
   .\scripts\get-mcp-id-token.ps1
   ```
   No pide contraseña; usa el refresh token guardado y devuelve un IdToken nuevo. Copia la salida y pégala en `.cursor/mcp.json` como `Bearer <token>`.

**B) AWS CLI (USER_PASSWORD_AUTH) – cada vez que quieras token**

```bash
aws cognito-idp initiate-auth \
  --region <COGNITO_REGION> \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id <COGNITO_APP_CLIENT_ID> \
  --auth-parameters USERNAME=<tu_email>,PASSWORD=<tu_contraseña> \
  --query 'AuthenticationResult.IdToken' --output text
```

Copia el valor (es el JWT que irá en `Authorization: Bearer ...`).

**C) API key de larga duración (recomendado si no quieres refrescar cada hora)**

En el **gateway** (local y/o EC2) define en `.env`:

- `MCP_API_KEY=<clave larga y aleatoria>` (p. ej. 64 caracteres hex)
- `MCP_API_KEY_USER_ID=<sub del usuario>` (opcional; por defecto `api-key-user`; si usas el mismo sub que tu usuario Cognito de prueba, el límite de sesiones es el mismo)

En `.cursor/mcp.json` pon en `headers.Authorization`:

- `"Authorization": "Bearer <MCP_API_KEY>"`

Esa clave **no caduca**; solo dejas de usarla cuando la rotes (cambias `MCP_API_KEY` en el servidor y en `mcp.json`). Así no tienes que refrescar cada hora.

**D) Consola AWS**

- Cognito → User Pools → *mcp-knowledge-hub-users* → **App integration** → tu app client.
- Para probar sin CLI puedes usar **Hosted UI** (si lo activas) y sacar el IdToken del navegador (DevTools → Application → Storage / cookies o red).

---

## 3. URLs correctas (tu despliegue)

Con el nginx actual del proyecto:

- **Base del API:** `http://mcp.domoticore.co/api`
- **Health:** `http://mcp.domoticore.co/api/health`
- **MCP (JSON-RPC):** `http://mcp.domoticore.co/api/mcp`

(En tu entorno es **http**, no https, y el path del MCP es **/api/mcp**.)

---

## 4. Probar con curl

**Sin token (debe dar 401):**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://mcp.domoticore.co/api/mcp -H "Content-Type: application/json" -d "{}"
# Esperado: 401
```

**Con token (initialize):**

Sustituye `TU_ID_TOKEN` por el IdToken del paso 2.

```bash
curl -s -X POST http://mcp.domoticore.co/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_ID_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

Esperado: respuesta JSON-RPC con `result.serverInfo`, `result.capabilities`, etc. (status 200).

**Listar tools (tras initialize):**

Mismo token, otro body:

```bash
curl -s -X POST http://mcp.domoticore.co/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_ID_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2,"params":{}}'
```

Esperado: `result.tools` con la lista de herramientas.

---

## 5. Probar desde Cursor

- [ ] **mcp.json** (configuración MCP de Cursor) con algo como:

```json
{
  "mcpServers": {
    "knowledge-hub-remote": {
      "url": "http://mcp.domoticore.co/api/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer TU_ID_TOKEN_AQUI"
      }
    }
  }
}
```

- [ ] Sustituir `TU_ID_TOKEN_AQUI` por el IdToken actual (caduca en 1 h con la config por defecto; luego hay que renovarlo o usar refresh).
- [ ] Reiniciar o recargar Cursor para que cargue el MCP remoto.
- [ ] Comprobar que el servidor “knowledge-hub-remote” aparece y que puedes usar tools (p. ej. `search_docs`).

---

## 6. Si algo falla

| Qué ves | Revisar |
|--------|---------|
| 401 sin token | Normal; hace falta header `Authorization: Bearer <token>`. |
| 401 con token | Token caducado o inválido; COGNITO_* en `.env` del gateway; región y User Pool ID correctos. |
| 502 / no responde | Gateway o nginx caídos en la EC2: `docker compose ps` y `docker compose logs gateway nginx`. |
| Cursor no lista tools | URL exacta `http://mcp.domoticore.co/api/mcp`; header con Bearer; token vigente. |
| **"Maximum sessions per user (3) reached"** | El gateway limita sesiones por usuario. **En la EC2:** añade `MAX_SESSIONS_PER_USER=10` al `.env` del gateway y reinicia: `docker compose restart gateway`. O reinicia sin cambiar nada para vaciar sesiones en memoria. |
| SSE error 405 (al hacer fallback) | El servidor solo soporta streamable-http; el 405 es normal si Cursor prueba SSE. Solución: resolver el límite de sesiones arriba. |
| **504 Gateway Time-out** | Nginx corta la petición antes de que el gateway responda. En el repo está aumentado `proxy_read_timeout` (y send/connect) en `nginx/nginx.conf` para `/api/`. Despliega y reinicia nginx en la EC2. |
| **"No stored tokens found"** (en logs de Cursor) | Mensaje interno de Cursor; no implica que falte el token. Si el Bearer está en `mcp.json` bajo `headers.Authorization`, se envía. Asegura: **un solo** `Authorization`, valor `Bearer <JWT>` sin espacios ni caracteres raros, JSON válido, y **reinicio completo de Cursor** tras cambiar `mcp.json`. |

### Config Cursor (referencia)

- **Ubicación:** `.cursor/mcp.json` (proyecto) o `~/.cursor/mcp.json` (global).
- **Formato** para servidor remoto streamable-http: `url`, `transport: "streamable-http"`, `headers: { "Authorization": "Bearer <IdToken>" }`.
- Tras editar `mcp.json` hay que **reiniciar Cursor por completo** para que cargue la config.

Más detalle: **gateway/docs/HTTP-MCP-CURSOR.md**.
