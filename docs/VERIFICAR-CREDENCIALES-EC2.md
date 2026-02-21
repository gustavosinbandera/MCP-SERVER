# Verificar credenciales en la instancia EC2 (Docker)

Comandos para comprobar si `INDEX_URL_USER` e `INDEX_URL_PASSWORD` están definidos en el contenedor del gateway **sin mostrar la contraseña**.

---

## 1. Conectar a la instancia

```bash
ssh -i infra/mcp-server-key.pem ec2-user@52.91.217.181
```

(O desde PowerShell: `ssh -i "infra\mcp-server-key.pem" ec2-user@52.91.217.181`)

---

## 2. Comprobar variables en el archivo .env (en el host)

El gateway usa el `.env` de la **raíz del proyecto** en la instancia (`~/MCP-SERVER/.env`), porque `docker-compose.yml` tiene `env_file: .env`.

**Solo ver si existen las claves (no muestra el valor de la contraseña):**

```bash
cd ~/MCP-SERVER
grep -E '^INDEX_URL_USER=|^INDEX_URL_PASSWORD=' .env | sed 's/=.*/=***/'
```

- Si ves `INDEX_URL_USER=***` y `INDEX_URL_PASSWORD=***` → están definidas (el valor está oculto).
- Si no sale ninguna línea → faltan; hay que añadirlas al `.env`.

**Ver si están vacías (solo nombre, sin valor):**

```bash
grep -E '^INDEX_URL_USER=|^INDEX_URL_PASSWORD=' .env
```

Si ves `INDEX_URL_USER=` o `INDEX_URL_PASSWORD=` sin nada después del `=`, están vacías.

---

## 3. Comprobar qué ve el contenedor del gateway

Variables que realmente carga el proceso del gateway:

```bash
cd ~/MCP-SERVER
docker compose exec gateway env | grep -E '^INDEX_URL_USER=|^INDEX_URL_PASSWORD=' | sed 's/=.*/=***/'
```

- Si sale `INDEX_URL_USER=***` y `INDEX_URL_PASSWORD=***` → el contenedor tiene ambas.
- Si no sale nada → el `.env` no tiene esas variables o el gateway no se ha reiniciado tras añadirlas.

---

## 4. Añadir o corregir credenciales

Editar el `.env` en la instancia:

```bash
cd ~/MCP-SERVER
nano .env
```

Añadir o modificar (sustituir por tu usuario y contraseña de dev.magaya.com):

```
INDEX_URL_USER=tu_usuario_wiki
INDEX_URL_PASSWORD=tu_contraseña
```

Guardar (en nano: `Ctrl+O`, Enter, `Ctrl+X`) y reiniciar el gateway:

```bash
docker compose restart gateway
```

---

## 5. Probar de nuevo mediawiki_login

Desde Cursor (con el MCP apuntando al gateway en la instancia), invoca de nuevo **mediawiki_login** con `url: "https://dev.magaya.com/index.php/Main_Page"`.
