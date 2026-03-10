# Run from your Windows machine (PowerShell) at repo root:
#   cd C:\PROYECTOS\MCP-SERVER
#   .\scripts\fix-gateway-remote.ps1
# Redeploys the gateway on EC2 with the reverted code. Requires SSH to 100.27.211.19.
# If SSH times out (firewall/instance), connect via Remote-SSH in Cursor and run on the server:
#   bash ~/MCP-SERVER/scripts/ec2/fix-gateway-redeploy.sh
$ErrorActionPreference = "Stop"
$keyPath = Join-Path $PSScriptRoot "..\infra\mcp-server-key.pem"
$sshHost = "100.27.211.19"
$user = "ec2-user"
if (-not (Test-Path $keyPath)) {
    Write-Error "Key not found: $keyPath"
    exit 1
}
$script = @"
set -e
cd ~/MCP-SERVER
git fetch origin
git checkout master
git pull origin master
docker compose build gateway
docker compose up -d gateway
docker compose ps gateway
docker compose logs gateway --tail 20
"@
Write-Host "Connecting to $user@$sshHost and redeploying gateway..."
ssh -o ConnectTimeout=15 -i $keyPath "${user}@${sshHost}" $script
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Done. Check https://mcp.domoticore.co/api/health"
