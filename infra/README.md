# Infraestructura AWS (CloudFormation)

## Contenido

- **mcp-ec2.yaml** – Stack que crea:
  - Security Group (puertos 22, 80, 443)
  - Instancia EC2 **mcp-server-instance** (Amazon Linux 2023, 30 GB gp3)
- **Scripts (orden de secuencia):**
  - **1-create-stack.ps1** – Crear el stack
  - **2-get-outputs.ps1** – Ver estado y outputs (IP, URL, comando SSH)
  - **3-delete-stack.ps1** – Eliminar el stack
  - **4-setup-remote.ps1** – Configurar la EC2 por SSH: instala Docker, copia proyecto y .env, ejecuta `docker compose up -d`
  - **5-route53-mcp.ps1** – Sincronizar IP de la EC2 con Route 53: actualiza el registro A **mcp.domoticore.co** con la PublicIP del stack (ejecutar tras crear/reiniciar la instancia o programar para monitorear)
  - **run.ps1** – Un solo script: `run.ps1 create | status | delete`

## Requisitos

- AWS CLI configurado (`aws configure`)
- **infra/parameters.json** (copia de `parameters.example.json` con tu `KeyName`; ya creado si usaste el key `mcp-server-key`)

## Uso automatizado (recomendado)

Desde la raíz del proyecto (o desde cualquier sitio, los scripts usan rutas relativas):

| Acción | Comando |
|--------|--------|
| **1. Crear infraestructura** | `.\infra\1-create-stack.ps1` |
| **2. Ver estado y IP** | `.\infra\2-get-outputs.ps1` |
| **3. Eliminar stack** | `.\infra\3-delete-stack.ps1` |
| **4. Configurar EC2 y desplegar** | `.\infra\4-setup-remote.ps1` (Docker + copia proyecto + compose up) |
| **5. Sincronizar dominio (mcp.domoticore.co)** | `.\infra\5-route53-mcp.ps1` (actualiza registro A con la IP del stack) |

O con un solo script:

```powershell
.\infra\run.ps1 create    # crear
.\infra\run.ps1 status    # ver outputs
.\infra\run.ps1 delete   # eliminar
```

No hace falta pasar argumentos: stack name, template y parámetros están fijos en los scripts. Así puedes replicar la infra en cualquier máquina con AWS CLI configurado y este repo.

## Cognito (JWT para /mcp HTTP streamable)

Si en el stack usas **CognitoCreateUserPool=true** (por defecto), el template crea un **User Pool** y un **App Client** para que el gateway valide JWT en `POST /mcp`.

**Outputs del stack** (tras `2-get-outputs.ps1` o `aws cloudformation describe-stacks`):
- **CognitoUserPoolId** → `COGNITO_USER_POOL_ID` en `.env` del gateway (en la EC2: `~/MCP-SERVER/.env` o `gateway/.env`).
- **CognitoAppClientId** → `COGNITO_APP_CLIENT_ID`.
- **CognitoRegion** → `COGNITO_REGION` (ej. `us-east-1`).

Añade en el `.env` que use el gateway (antes de `docker compose up`):

```bash
COGNITO_REGION=<CognitoRegion del output>
COGNITO_USER_POOL_ID=<CognitoUserPoolId del output>
COGNITO_APP_CLIENT_ID=<CognitoAppClientId del output>
```

Luego reinicia el gateway: `docker compose restart gateway`.

**Crear usuarios en el User Pool:** consola AWS → Cognito → User Pools → *mcp-knowledge-hub-users* → Users → Create user (email + contraseña temporal). Para obtener IdToken desde CLI: `aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH --client-id <AppClientId> --auth-parameters USERNAME=<email>,PASSWORD=<pass> --query 'AuthenticationResult.IdToken'`.

Si ya tienes un User Pool, pon **CognitoCreateUserPool=false** en `parameters.json` y configura en `.env` las variables con los valores de tu pool.

## Seguridad (producción)

- **AllowedSSHCIDR**: En producción no debe quedar `0.0.0.0/0`. Usa tu IP fija o CIDR de VPN en `infra/parameters.json` (parámetro `AllowedSSHCIDR`) para restringir SSH al puerto 22.
- Los puertos 80 y 443 quedan abiertos; el endpoint `/mcp` está protegido por JWT (Cognito). Rate-limit en borde (WAF/CloudFront) se puede añadir en una fase posterior.

## Dominio mcp.domoticore.co

El script **5-route53-mcp.ps1** obtiene la PublicIP del stack y actualiza el registro A de **mcp.domoticore.co** en Route 53. Ejecútalo tras crear o reiniciar la EC2 (la IP puede cambiar si no usas IP elástica).

**Programar para monitorear:** en Windows, Programador de tareas (Task Scheduler): crear tarea que ejecute `powershell.exe -File C:\PROYECTOS\MCP-SERVER\infra\5-route53-mcp.ps1` cada hora (o el intervalo que quieras) para que el DNS siga apuntando a la IP actual.

## Indexar desde la EC2

Para que la indexación (classic, blueivory) se ejecute **desde la instancia EC2**:

1. **Desplegar proyecto y carpetas a la EC2**  
   Desde tu máquina (en la raíz del repo):
   ```powershell
   .\infra\4-setup-remote.ps1
   ```
   Esto copia el proyecto (gateway, webapp, nginx, worker), **classic** y **blueivory** si existen, y `gateway\.env` como `.env` en la raíz del proyecto remoto. Luego ejecuta `docker compose up -d --build` en la EC2.

2. **Configurar `.env` en la EC2**  
   El script copia `gateway\.env` a `~/MCP-SERVER/.env` en la EC2. Asegúrate de que en **gateway\.env** (antes de ejecutar 4-setup-remote) tengas al menos:
   - **OPENAI_API_KEY** = tu clave de OpenAI (para embeddings y búsqueda semántica).
   - **SHARED_DIRS** = `classic:classic;blueivory:blueivory` (o el valor que uses).
   - Opcional: **INDEX_SHARED_REINDEX_CHANGED=true** para reindexar archivos cuyo contenido cambió; **INDEX_SHARED_SYNC_DELETED=true** para borrar de Qdrant los archivos que ya no existan en disco.

3. **Levantar los contenedores**  
   Si no lo hizo ya el script:
   ```powershell
   ssh -i infra/mcp-server-key.pem ec2-user@<PublicIP>
   cd ~/MCP-SERVER
   docker compose up -d --build
   ```

4. **Ejecutar la indexación**  
   Con `docker compose up -d` se levanta también el contenedor **mcp-supervisor**, que ejecuta el supervisor cada 2 min (inbox + classic + blueivory). Para lanzar **un solo ciclo** y comprobar que indexa bien:
   ```bash
   docker exec mcp-supervisor node dist/supervisor.js --once
   ```
   Verás en consola si se usa la API key, el modelo de embeddings, y cuántos archivos se indexan (nuevos/reindexados).

5. **Revisar logs**  
   ```bash
   docker logs mcp-supervisor -f
   ```
   Busca líneas como `indexSharedDirs starting`, `indexSharedDirs completed`, `reindex with diff`, y errores si los hay.

6. **Probar búsqueda**  
   Si expusiste el puerto 80 (nginx) o 3001 (gateway), prueba el health y la búsqueda según tu API (por ejemplo `GET /health` y la ruta de búsqueda de documentos).

Si cambias código en classic/blueivory y quieres que se reindexe solo lo cambiado, deja **INDEX_SHARED_REINDEX_CHANGED=true** en el `.env`; la indexación por diff solo embeberá los chunks nuevos o modificados.

---

## Después de crear

Cuando el stack esté en `CREATE_COMPLETE`, `2-get-outputs.ps1` muestra la **PublicIP** y el comando SSH. Conéctate con:

```powershell
ssh -i infra/mcp-server-key.pem ec2-user@<PublicIP>
```

## Desplegar a mano (opcional)

Si prefieres no usar los scripts:

```powershell
cd C:\PROYECTOS\MCP-SERVER
aws cloudformation create-stack --stack-name mcp-hub-infra --template-body file://infra/mcp-ec2.yaml --parameters file://infra/parameters.json
aws cloudformation describe-stacks --stack-name mcp-hub-infra --query "Stacks[0].Outputs"
aws cloudformation delete-stack --stack-name mcp-hub-infra
```
