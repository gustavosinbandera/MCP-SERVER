# Actualizar solo el gateway en la EC2 (copia gateway + rebuild + restart).
# Uso: .\infra\5-update-gateway.ps1
# Requiere: infra/mcp-server-key.pem, stack mcp-hub-infra con PublicIP.

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$ProjectRoot = Split-Path $ScriptDir -Parent
$StackName = "mcp-hub-infra"
$KeyFile = Join-Path $ScriptDir "mcp-server-key.pem"
$RemoteUser = "ec2-user"
$RemoteDir = "~/MCP-SERVER"

$PublicIP = aws cloudformation describe-stacks --stack-name $StackName --query "Stacks[0].Outputs[?OutputKey=='PublicIP'].OutputValue" --output text 2>$null
if (-not $PublicIP) { Write-Error "No PublicIP. Ejecuta .\infra\2-get-outputs.ps1"; exit 1 }
if (-not (Test-Path $KeyFile)) { Write-Error "No se encuentra $KeyFile"; exit 1 }

$scpArgs = @("-i", $KeyFile, "-o", "StrictHostKeyChecking=accept-new")
$sshCmd = "ssh -o StrictHostKeyChecking=accept-new -i `"$KeyFile`" ${RemoteUser}@${PublicIP}"

Write-Host "IP: $PublicIP - Copiando gateway..." -ForegroundColor Cyan
$Staging = Join-Path $env:TEMP "mcp-gateway-update-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $Staging -Force | Out-Null
Push-Location $ProjectRoot
try {
    robocopy gateway (Join-Path $Staging "gateway") /E /XD node_modules .next .git dist out __pycache__ .venv /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Robocopy fallo" }
    & scp @scpArgs -r (Join-Path $Staging "gateway") "${RemoteUser}@${PublicIP}:${RemoteDir}/"
    if ($LASTEXITCODE -ne 0) { Write-Error "Fallo scp"; exit 1 }
} finally {
    Pop-Location
    Remove-Item $Staging -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "Reconstruyendo y reiniciando gateway en la EC2..." -ForegroundColor Cyan
Invoke-Expression "$sshCmd `"cd $RemoteDir && docker compose build gateway && docker compose up -d gateway`""
if ($LASTEXITCODE -ne 0) { Write-Error "Fallo build/up"; exit 1 }
Write-Host "Gateway actualizado." -ForegroundColor Green
