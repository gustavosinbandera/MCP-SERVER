# Infraestructura AWS (CloudFormation)

## Contenido

- **mcp-ec2.yaml** – Stack que crea:
  - Security Group (puertos 22, 80, 443)
  - Instancia EC2 **mcp-server-instance** (Amazon Linux 2023, 30 GB gp3)
- **Scripts (sin argumentos):**
  - **create-stack.ps1** – Crear el stack
  - **get-outputs.ps1** – Ver estado y outputs (IP, URL, comando SSH)
  - **delete-stack.ps1** – Eliminar el stack
  - **run.ps1** – Un solo script: `run.ps1 create | status | delete`

## Requisitos

- AWS CLI configurado (`aws configure`)
- **infra/parameters.json** (copia de `parameters.example.json` con tu `KeyName`; ya creado si usaste el key `mcp-server-key`)

## Uso automatizado (recomendado)

Desde la raíz del proyecto (o desde cualquier sitio, los scripts usan rutas relativas):

| Acción | Comando |
|--------|--------|
| **Crear infraestructura** | `.\infra\create-stack.ps1` |
| **Ver estado y IP** | `.\infra\get-outputs.ps1` |
| **Eliminar stack** | `.\infra\delete-stack.ps1` |

O con un solo script:

```powershell
.\infra\run.ps1 create    # crear
.\infra\run.ps1 status    # ver outputs
.\infra\run.ps1 delete   # eliminar
```

No hace falta pasar argumentos: stack name, template y parámetros están fijos en los scripts. Así puedes replicar la infra en cualquier máquina con AWS CLI configurado y este repo.

## Después de crear

Cuando el stack esté en `CREATE_COMPLETE`, `get-outputs.ps1` muestra la **PublicIP** y el comando SSH. Conéctate con:

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
