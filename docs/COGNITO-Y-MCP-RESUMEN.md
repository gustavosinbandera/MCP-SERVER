# Cognito, MCP Server y el intento de conectar con ChatGPT

Documento de referencia: cómo usamos Cognito, cómo está configurado el MCP y qué pasó al intentar conectar el servidor MCP a ChatGPT.

---

## 1. Cómo usamos Cognito hoy

### 1.1 Propósito

Cognito se usa **solo para validar JWT** en el endpoint `POST /api/mcp`. No hay flujo OAuth ni pantallas de login gestionadas por nuestro gateway.

- **User Pool y App Client** se crean con CloudFormation (`infra/mcp-ec2.yaml`) cuando `CognitoCreateUserPool=true`.
- El gateway lee en `.env`: `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`.
- Para cada petición a `/api/mcp`, el middleware `requireJwt` exige cabecera `Authorization: Bearer <token>`.

### 1.2 Dos formas de autenticación

| Método | Uso | Caducidad |
|--------|-----|-----------|
| **MCP_API_KEY** | Bearer con el valor de `MCP_API_KEY` del `.env` | No caduca |
| **JWT de Cognito** | Bearer con IdToken obtenido de Cognito (Hosted UI, CLI o `initiate-auth`) | Según configuración del App Client (p. ej. 24 h) |

Si el token coincide con `MCP_API_KEY`, se acepta como usuario fijo (`MCP_API_KEY_USER_ID`). Si no, se valida como JWT de Cognito: firma con JWKS del User Pool, `issuer` y `audience` (App Client ID).

### 1.3 Configuración en AWS (template)

- **User Pool**: nombre `mcp-knowledge-hub-users`, login por email, políticas de contraseña, etc.
- **App Client**: sin secret, flujos `USER_PASSWORD_AUTH`, `REFRESH_TOKEN_AUTH`, `USER_SRP_AUTH`; tokens 24 h; CallbackURLs/LogoutURLs con `CognitoCallbackBaseUrl` (p. ej. `https://mcp.domoticore.co/api`).
- **Dominio Hosted UI**: `mcp-hub-domoticore` (para quien quiera obtener JWT desde la web).

En el gateway **no** hay rutas de OAuth discovery ni `/authorize`. Las respuestas 401 llevan solo `WWW-Authenticate: Bearer`.

---

## 2. Cómo está configurado el MCP server

### 2.1 Endpoint

- **URL pública:** `https://mcp.domoticore.co/api/mcp`
- **Transporte:** MCP sobre HTTP (streamable).
- **Protección:** `requireJwt`: o bien Bearer = `MCP_API_KEY`, o bien JWT de Cognito válido.

### 2.2 En Cursor (.cursor/mcp.json)

Ejemplo de servidor remoto (p. ej. "magaya"):

```json
"magaya": {
  "url": "https://mcp.domoticore.co/api/mcp",
  "transport": "streamable-http",
  "headers": {
    "Authorization": "Bearer <MCP_API_KEY>"
  }
}
```

Ese Bearer es el `MCP_API_KEY` definido en el `.env` del gateway en la EC2. Cursor usa ese servidor para invocar herramientas (search_docs, count_docs, etc.) sin usar Cognito.

### 2.3 Resumen

- **Cognito:** solo validación de JWT cuando el cliente envía un IdToken.
- **Uso habitual (Cursor):** API key fija en cabecera; no interviene el flujo de login de Cognito.

---

## 3. Qué quisimos hacer: conectar el MCP a ChatGPT

ChatGPT permite añadir “connectors” MCP. Para eso, el servidor puede exponer:

- **Discovery OAuth:** una URL de “recurso protegido” (p. ej. RFC 9728) que indica cómo obtener un token (authorization server, scopes, etc.).
- **Flujo:** el usuario abre una URL de autorización → login (p. ej. Cognito Hosted UI) → callback con código → intercambio por tokens → el cliente usa el token como Bearer contra el MCP.

Objetivo: que el usuario pudiera elegir “Conectar MCP” en ChatGPT, hacer login con Cognito y usar el Knowledge Hub desde ChatGPT.

---

## 4. El problema real (por qué no funcionó)

### 4.1 Qué implementamos entonces

Se añadió en el gateway (luego se quitó):

- `/.well-known/oauth-protected-resource` (recurso + authorization server).
- `/.well-known/openid-configuration` y `/.well-known/oauth-authorization-server`.
- `/.well-known/jwks.json` (proxy al JWKS de Cognito).
- `GET /authorize`: redirigir a Cognito `oauth2/authorize` con `client_id`, `redirect_uri`, `scope`, `state`.

Flujo esperado:

1. Usuario abre `https://mcp.domoticore.co/api/authorize` (o ChatGPT redirige ahí).
2. Gateway responde 302 a Cognito `oauth2/authorize?...`.
3. Cognito responde 302 a su `/login` y envía en la respuesta **Set-Cookie: XSRF-TOKEN=...** (y otras).
4. El navegador sigue el redirect y pide `/login` **con esa cookie**.
5. Cognito muestra la pantalla de login; tras autenticarse, redirige al callback con el código.

### 4.2 Dónde fallaba

En el paso 4: **el navegador no enviaba la cookie en la petición al `/login`**.

- Cognito devuelve **302** con **Set-Cookie** (XSRF-TOKEN, etc.) y **Location: .../login**.
- Es un comportamiento conocido: en muchos navegadores **la cookie que llega en esa 302 no se envía en la petición inmediata al Location** (la siguiente petición del redirect).
- Sin esa cookie, Cognito considera la petición a `/login` inválida y redirige a **/error** (“An error was encountered with the requested page”).

Se comprobó con Puppeteer y con peticiones manuales: la cookie existía en la respuesta de Cognito, pero no aparecía en la petición a `/login`. Ocurría tanto entrando por nuestro gateway como abriendo directamente la URL de Cognito; es decir, el fallo no era por nuestra lógica de redirect ni por el dominio.

### 4.3 Qué probamos y no sirvió

- Quitar el parámetro `resource` del redirect a Cognito (evitar 400 por parámetro no soportado).
- Añadir `identity_provider=COGNITO`.
- Usar PKCE (`code_challenge`, `code_challenge_method=S256`).
- Usar `state` aleatorio en lugar de fijo.
- En lugar de 302, devolver una **página HTML** con un enlace a Cognito para que el usuario hiciera clic (así la “navegación de nivel superior” era a Cognito): seguía fallando en la misma cadena 302 → /login sin cookie.
- Probar con flags de Chromium para relajar SameSite: la cookie seguía sin enviarse en el redirect a `/login`.

Nada de eso cambiaba el hecho de que la cookie del 302 no se incluye en el siguiente request en ese flujo.

### 4.4 Conclusión del intento ChatGPT

- **Causa:** Comportamiento del navegador con cookies en respuestas 302 (no enviar en el redirect inmediato); Cognito exige esa cookie en `/login`.
- **No es:** un error de configuración de callbacks en Cognito, ni de parámetros OAuth en el gateway, ni de “cross-origin” por usar nuestro dominio en el primer redirect.
- Se decidió **dejar de usar ChatGPT** para este MCP y **quitar** del proyecto todo lo añadido para OAuth/ChatGPT (discovery, `/authorize`, callback extra en el template, scripts de prueba, etc.). El estado actual es el descrito en las secciones 1 y 2: solo JWT + API key, sin OAuth ni pantallas de login en el gateway.

---

## 5. Estado actual (resumen)

| Aspecto | Estado |
|---------|--------|
| **Cognito** | User Pool + App Client para validar JWT en `/api/mcp`. Hosted UI disponible para quien quiera obtener IdToken a mano. |
| **Auth en /api/mcp** | Bearer = `MCP_API_KEY` (aceptado siempre) o JWT de Cognito válido. |
| **OAuth / discovery** | No existe. No hay `oauth-protected-resource`, ni `openid-configuration`, ni `/authorize`. |
| **Callbacks en Cognito** | Solo la URL base (`CognitoCallbackBaseUrl`). Sin URLs extra para ChatGPT. |
| **Cursor** | Conectado vía `streamable-http` a `https://mcp.domoticore.co/api/mcp` con Bearer = `MCP_API_KEY`. |
| **ChatGPT** | No conectado; el intento se abandonó por el problema de la cookie en el redirect de Cognito. |

---

*Documento de referencia. Para obtener JWT de prueba: ver docs/TESTEAR-MCP-HTTP-STREAMABLE.md y scripts/get-mcp-id-token.ps1.*
