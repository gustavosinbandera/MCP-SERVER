# Cómo conectar el MCP (Keycloak OAuth) en ChatGPT

Con el servidor desplegado en EC2, sigue estos pasos para usar el MCP desde ChatGPT.

---

## Requisitos

- Cuenta ChatGPT con **Modo desarrollador** disponible (según tu plan/organización).
- **auth.domoticore.co** debe resolver en DNS a la IP de tu EC2 (para el login en el navegador). Si aún no está configurado, añade un registro A en tu DNS apuntando a la IP pública de la instancia.

---

## 1. Activar modo desarrollador

1. En **ChatGPT**, abre **Configuración** (engranaje).
2. Ve a **Apps y conectores** → **Configuración avanzada** (al final).
3. Activa **Modo desarrollador** (Developer mode).

Así se desbloquea la opción de crear conectores propios.

---

## 2. Crear el conector MCP

1. En **Configuración** → **Apps y conectores**, haz clic en **Crear** (Create).
2. **URL del conector**  
   Usa la URL pública del endpoint MCP:
   ```text
   https://mcp.domoticore.co/api/mcp
   ```
   Si en algún momento ChatGPT pide una “URL base” o “recurso” en lugar del endpoint, prueba también:
   ```text
   https://mcp.domoticore.co
   ```
3. **Nombre**: por ejemplo `MCP Knowledge Hub` o `Domoticore MCP`.
4. **Descripción** (opcional): por ejemplo “Búsqueda en documentación, Azure, ClickUp y herramientas MCP”.
5. **Autenticación**: elige **OAuth** (o la opción que indique que el servidor usa OAuth / “discovery”).

ChatGPT debería:

- Llamar al recurso y detectar que requiere OAuth.
- Descubrir el servidor de autorización desde `https://mcp.domoticore.co/.well-known/oauth-protected-resource` (PRM), donde aparece `https://auth.domoticore.co`.
- Hacer el registro dinámico del cliente (DCR) contra Keycloak.
- Iniciar el flujo OAuth con PKCE.

---

## 3. Iniciar sesión en Keycloak

Cuando ChatGPT abra la ventana de login:

1. **URL**: debería ser algo como `https://auth.domoticore.co/realms/mcp/...`.
2. **Usuario**: `mcp-test`  
   (o el usuario que hayas creado en el realm `mcp`).
3. **Contraseña**: `change-me-mcp-test`  
   (o la que hayas puesto en el script de creación del usuario).

Si es la primera vez, Keycloak puede pedir actualizar la contraseña; acéptalo y elige una nueva.

---

## 4. Usar el conector en un chat

1. Abre un **nuevo chat** en ChatGPT.
2. Junto al cuadro de mensaje, pulsa el **+** (o “Más”).
3. En la lista de herramientas/conectores, selecciona el conector que creaste (p. ej. **MCP Knowledge Hub**).
4. Actívalo para ese chat.
5. Escribe un mensaje que use las herramientas del MCP (por ejemplo: “Busca en la documentación sobre X” o “Lista las tareas de Azure”).

---

## Si algo falla

- **“No se pudo conectar” / error de red**  
  Comprueba que `https://mcp.domoticore.co/api/health` responda desde tu navegador y que no haya firewall bloqueando.

- **“Authorization server” no encontrado**  
  Verifica que `https://mcp.domoticore.co/.well-known/oauth-protected-resource` devuelva JSON con `resource` y `authorization_servers` (incluyendo `https://auth.domoticore.co`).

- **Error al hacer login (auth.domoticore.co)**  
  - Comprueba que el DNS de **auth.domoticore.co** apunte a la IP de la EC2.  
  - Si usas cert autofirmado, el navegador puede mostrar aviso de seguridad; en pruebas puedes continuar de todas formas.

- **401 al llamar al MCP**  
  Vuelve a conectar el conector (desconectar y conectar de nuevo) para refrescar el token de Keycloak.

---

## Resumen de URLs

| Uso              | URL |
|------------------|-----|
| Endpoint MCP     | `https://mcp.domoticore.co/api/mcp` |
| PRM (discovery)  | `https://mcp.domoticore.co/.well-known/oauth-protected-resource` |
| Login Keycloak   | `https://auth.domoticore.co/realms/mcp` |
| Usuario prueba   | `mcp-test` / `change-me-mcp-test` |

Cuando tengas **auth.domoticore.co** en DNS y (opcional) un certificado real con Let's Encrypt, el flujo será el mismo; solo dejará de aparecer el aviso del certificado autofirmado.
