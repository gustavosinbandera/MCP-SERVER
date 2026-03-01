# What you need to test MCP over streamable HTTP

Minimal checklist to test `POST /mcp` (JWT + JSON-RPC) from your machine or from Cursor.

**Test user (already created in Cognito):** `mcp-test@domoticore.co` — use its password to obtain an IdToken (AWS CLI or Hosted UI) and test Cursor.

---

## 1. Cognito ready (User Pool + user)

- [ ] **Stack with Cognito:** You created/updated the stack with `CognitoCreateUserPool=true` and you have the **Outputs**: `CognitoUserPoolId`, `CognitoAppClientId`, `CognitoRegion`.
- [ ] **User in the User Pool:** In AWS Console → Cognito → User Pools → *mcp-knowledge-hub-users* → **Users** → **Create user**:
  - Email: the one you will use to log in.
  - Temporary password (check “Send an email invitation”, or set a password and require the user to change it later).
- [ ] **`.env` on EC2:** On the instance, in `~/MCP-SERVER/.env` (or the `.env` used by the gateway) you have:
  ```bash
  COGNITO_REGION=<valor del output CognitoRegion>
  COGNITO_USER_POOL_ID=<valor del output CognitoUserPoolId>
  COGNITO_APP_CLIENT_ID=<valor del output CognitoAppClientId>
  ```
- [ ] **Restart gateway:** After editing `.env`, on EC2:  
  `docker compose restart gateway`

---

## 2. Get an IdToken (for the Bearer)

You need a **valid token** (Cognito IdToken). Options:

**A) Script using a Refresh Token (recommended for ~2 months of testing)**

The Cognito **RefreshToken** can last **60 days**. Once you have it, you don’t need to enter a password again during that period.

1. **First time** (only once every ~2 months):
   ```powershell
   cd C:\PROYECTOS\MCP-SERVER
   .\scripts\get-mcp-id-token.ps1 -Login
   ```
   It asks for email and password. It prints the IdToken and stores the RefreshToken at `%USERPROFILE%\.mcp-cognito-refresh`.

2. **Whenever you need a new IdToken** (e.g. when it expires after 1 hour, or to update Cursor):
   ```powershell
   .\scripts\get-mcp-id-token.ps1
   ```
   It does not ask for a password; it uses the stored refresh token and returns a new IdToken. Copy the output and paste it into `.cursor/mcp.json` as `Bearer <token>`.

**B) AWS CLI (USER_PASSWORD_AUTH) – every time you want a token**

```bash
aws cognito-idp initiate-auth \
  --region <COGNITO_REGION> \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id <COGNITO_APP_CLIENT_ID> \
  --auth-parameters USERNAME=<your_email>,PASSWORD=<your_password> \
  --query 'AuthenticationResult.IdToken' --output text
```

Copy the value (this is the JWT that goes into `Authorization: Bearer ...`).

**C) Long-lived API key (recommended if you don’t want to refresh hourly)**

In the **gateway** (local and/or EC2) set in `.env`:

- `MCP_API_KEY=<long random key>` (e.g. 64 hex chars)
- `MCP_API_KEY_USER_ID=<user sub>` (optional; default `api-key-user`; if you use the same sub as your test Cognito user, session limits apply the same way)

In `.cursor/mcp.json`, set `headers.Authorization`:

- `"Authorization": "Bearer <MCP_API_KEY>"`

This key **does not expire**; you stop using it only when you rotate it (change `MCP_API_KEY` on the server and in `mcp.json`). That way you don’t need to refresh every hour.

**D) AWS Console**

- Cognito → User Pools → *mcp-knowledge-hub-users* → **App integration** → your app client.
- To test without CLI you can use **Hosted UI** (if enabled) and extract the IdToken from the browser (DevTools → Application → Storage / cookies or Network).

---

## 3. Correct URLs (your deployment)

With the project’s current nginx:

- **API base:** `http://mcp.domoticore.co/api`
- **Health:** `http://mcp.domoticore.co/api/health`
- **MCP (JSON-RPC):** `http://mcp.domoticore.co/api/mcp`

(In this environment it is **http**, not https, and the MCP path is **/api/mcp**.)

---

## 4. Test with curl

**Without token (should return 401):**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://mcp.domoticore.co/api/mcp -H "Content-Type: application/json" -d "{}"
# Esperado: 401
```

**With token (initialize):**

Replace `TU_ID_TOKEN` with the IdToken from step 2.

```bash
curl -s -X POST http://mcp.domoticore.co/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_ID_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

Expected: JSON-RPC response with `result.serverInfo`, `result.capabilities`, etc. (status 200).

**List tools (after initialize):**

Same token, different body:

```bash
curl -s -X POST http://mcp.domoticore.co/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_ID_TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2,"params":{}}'
```

Expected: `result.tools` with the list of tools.

---

## 5. Test from Cursor

- [ ] **mcp.json** (Cursor MCP configuration) like:

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

- [ ] Replace `TU_ID_TOKEN_AQUI` with the current IdToken (expires in 1 hour with default config; then renew or use refresh).
- [ ] Restart/reload Cursor so it loads the remote MCP.
- [ ] Verify the “knowledge-hub-remote” server shows up and you can use tools (e.g. `search_docs`).

---

## 6. If something fails

| What you see | Check |
|--------|---------|
| 401 without token | Expected; you need the `Authorization: Bearer <token>` header. |
| 401 with token | Token expired/invalid; COGNITO_* in gateway `.env`; correct region and User Pool ID. |
| 502 / no response | Gateway or nginx is down on EC2: `docker compose ps` and `docker compose logs gateway nginx`. |
| Cursor doesn’t list tools | Exact URL `http://mcp.domoticore.co/api/mcp`; Bearer header present; token valid. |
| **"Maximum sessions per user (3) reached"** | The gateway limits sessions per user. **On EC2:** add `MAX_SESSIONS_PER_USER=10` to the gateway `.env` and restart: `docker compose restart gateway`. Or restart without changes to clear in-memory sessions. |
| SSE error 405 (when falling back) | The server only supports streamable-http; 405 is expected if Cursor tries SSE. Fix by addressing the session limit above. |
| **504 Gateway Time-out** | Nginx times out before the gateway responds. This repo increases `proxy_read_timeout` (and send/connect) in `nginx/nginx.conf` for `/api/`. Deploy and restart nginx on EC2. |
| **"No stored tokens found"** (in Cursor logs) | Internal Cursor message; it doesn’t necessarily mean the token is missing. If the Bearer is in `mcp.json` under `headers.Authorization`, it will be sent. Ensure: **only one** `Authorization`, value `Bearer <JWT>` without weird spaces/chars, valid JSON, and **full Cursor restart** after editing `mcp.json`. |

### Cursor config (reference)

- **Location:** `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global).
- **Format** for a remote streamable-http server: `url`, `transport: "streamable-http"`, `headers: { "Authorization": "Bearer <IdToken>" }`.
- After editing `mcp.json` you must **fully restart Cursor** so it reloads the config.

More detail: **gateway/docs/HTTP-MCP-CURSOR.md**.
