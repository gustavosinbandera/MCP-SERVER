# Verify credentials on the EC2 instance (Docker)

Commands to verify whether `INDEX_URL_USER` and `INDEX_URL_PASSWORD` are defined in the gateway container **without showing the password**.

---

## 1. Connect to the instance

```bash
ssh -i infra/mcp-server-key.pem ec2-user@52.91.217.181
```

(Or from PowerShell: `ssh -i "infra\\mcp-server-key.pem" ec2-user@52.91.217.181`)

---

## 2. Check variables in the .env file (on the host)

The gateway uses the `.env` at the **project root** on the instance (`~/MCP-SERVER/.env`) because `docker-compose.yml` has `env_file: .env`.

**Only check whether the keys exist (does not show the password value):**

```bash
cd ~/MCP-SERVER
grep -E '^INDEX_URL_USER=|^INDEX_URL_PASSWORD=' .env | sed 's/=.*/=***/'
```

- If you see `INDEX_URL_USER=***` and `INDEX_URL_PASSWORD=***` → they are defined (value is masked).
- If nothing prints → they’re missing; add them to `.env`.

**Check if they are empty (key name, no value):**

```bash
grep -E '^INDEX_URL_USER=|^INDEX_URL_PASSWORD=' .env
```

If you see `INDEX_URL_USER=` or `INDEX_URL_PASSWORD=` with nothing after `=`, they’re empty.

---

## 3. Check what the gateway container sees

Variables actually loaded by the gateway process:

```bash
cd ~/MCP-SERVER
docker compose exec gateway env | grep -E '^INDEX_URL_USER=|^INDEX_URL_PASSWORD=' | sed 's/=.*/=***/'
```

- If you see `INDEX_URL_USER=***` and `INDEX_URL_PASSWORD=***` → the container has both.
- If nothing prints → either `.env` doesn’t contain them, or the gateway wasn’t restarted after adding them.

---

## 4. Add or fix credentials

Edit `.env` on the instance:

```bash
cd ~/MCP-SERVER
nano .env
```

Add/modify (replace with your dev.magaya.com username/password):

```
INDEX_URL_USER=tu_usuario_wiki
INDEX_URL_PASSWORD=your_password
```

Save (in nano: `Ctrl+O`, Enter, `Ctrl+X`) and restart the gateway:

```bash
docker compose restart gateway
```

---

## 5. Re-test mediawiki_login

From Cursor (with MCP pointing to the gateway on the instance), invoke **mediawiki_login** again with `url: "https://dev.magaya.com/index.php/Main_Page"`.
