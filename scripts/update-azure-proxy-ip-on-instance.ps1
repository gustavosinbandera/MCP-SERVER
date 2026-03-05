# Actualiza AZURE_DEVOPS_PROXY_URL en la instancia con tu IP pública actual.
# Útil cuando tu IP pública cambia (ej. reinicio del router) y el proxy corre en tu PC.
#
# Uso (desde la raíz del repo):
#   .\scripts\update-azure-proxy-ip-on-instance.ps1
#   .\scripts\update-azure-proxy-ip-on-instance.ps1 -RestartGateway
#   .\scripts\update-azure-proxy-ip-on-instance.ps1 -ProxyPort 3099
#
# Opcional: INSTANCE_SSH_KEY_PATH, INSTANCE_SSH_TARGET (ej. ec2-user@52.91.217.181)

param(
    [int]$ProxyPort = 3099,
    [switch]$RestartGateway
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir

$keyPath = if ($env:INSTANCE_SSH_KEY_PATH) { $env:INSTANCE_SSH_KEY_PATH } else { Join-Path $RepoRoot "infra\mcp-server-key.pem" }
$sshTarget = if ($env:INSTANCE_SSH_TARGET) { $env:INSTANCE_SSH_TARGET } else { "ec2-user@52.91.217.181" }

if (-not (Test-Path $keyPath)) {
    Write-Host "Clave SSH no encontrada: $keyPath" -ForegroundColor Red
    Write-Host "Configura INSTANCE_SSH_KEY_PATH o ejecuta desde la raíz del repo." -ForegroundColor Yellow
    exit 1
}

# Obtener IP pública
Write-Host "[1/3] Obteniendo tu IP pública..." -ForegroundColor Cyan
try {
    $publicIp = (Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 10).Trim()
    if (-not $publicIp -or $publicIp -notmatch '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$') {
        throw "Respuesta no es una IPv4: $publicIp"
    }
} catch {
    try {
        $publicIp = (Invoke-RestMethod -Uri "https://ifconfig.me/ip" -TimeoutSec 10).Trim()
    } catch {
        Write-Host "No se pudo obtener la IP pública. Comprueba conexión a internet." -ForegroundColor Red
        exit 1
    }
}
$proxyUrl = "http://${publicIp}:$ProxyPort"
Write-Host "  IP pública: $publicIp  ->  AZURE_DEVOPS_PROXY_URL=$proxyUrl" -ForegroundColor Green

# Actualizar gateway/.env en la instancia (una sola línea para evitar CRLF en Windows)
Write-Host "[2/3] Actualizando gateway/.env en la instancia..." -ForegroundColor Cyan
$remoteCmd = "cd ~/MCP-SERVER/gateway && (grep -q '^AZURE_DEVOPS_PROXY_URL=' .env 2>/dev/null && sed -i 's|^AZURE_DEVOPS_PROXY_URL=.*|AZURE_DEVOPS_PROXY_URL=$proxyUrl|' .env || (grep -q '^# AZURE_DEVOPS_PROXY_URL=' .env 2>/dev/null && sed -i 's|^# AZURE_DEVOPS_PROXY_URL=.*|AZURE_DEVOPS_PROXY_URL=$proxyUrl|' .env || echo 'AZURE_DEVOPS_PROXY_URL=$proxyUrl' >> .env)) && grep '^AZURE_DEVOPS_PROXY_URL=' .env"
$fullCmd = "ssh -i `"$keyPath`" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 $sshTarget `"$remoteCmd`""
Invoke-Expression $fullCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error al actualizar .env en la instancia." -ForegroundColor Red
    exit 1
}

# Opcional: recrear gateway para que cargue el nuevo env
if ($RestartGateway) {
    Write-Host "[3/3] Recreando contenedor gateway en la instancia..." -ForegroundColor Cyan
    $restartCmd = "ssh -i `"$keyPath`" -o ConnectTimeout=15 $sshTarget `"cd ~/MCP-SERVER && docker compose up -d --force-recreate gateway`""
    Invoke-Expression $restartCmd
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error al recrear gateway." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Gateway recreado. El MCP de la instancia usará el proxy en $proxyUrl" -ForegroundColor Green
} else {
    Write-Host "[3/3] Sin reinicio. Para que el gateway use la nueva URL ejecuta en la instancia:" -ForegroundColor Yellow
    Write-Host "  docker compose up -d --force-recreate gateway" -ForegroundColor Yellow
    Write-Host "  o vuelve a ejecutar este script con -RestartGateway" -ForegroundColor Yellow
}

Write-Host "Listo. Asegúrate de que el puerto $ProxyPort está abierto en tu router y que npm run azure-proxy está en marcha." -ForegroundColor Cyan
