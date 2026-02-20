# MCP Knowledge Hub - Configurar la EC2 por SSH (sin argumentos)
# Ejecuta en la maquina remota: instalar Docker, copiar proyecto, .env, docker compose up
# Uso: .\infra\4-setup-remote.ps1
# Requiere: stack mcp-hub-infra creado, AWS CLI configurado, key infra/mcp-server-key.pem

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$ProjectRoot = Split-Path $ScriptDir -Parent
$StackName = "mcp-hub-infra"
$KeyFile = Join-Path $ScriptDir "mcp-server-key.pem"
$RemoteUser = "ec2-user"
$RemoteDir = "~/MCP-SERVER"

# Obtener IP del stack
Write-Host "Obteniendo IP del stack $StackName..." -ForegroundColor Cyan
$PublicIP = aws cloudformation describe-stacks --stack-name $StackName --query "Stacks[0].Outputs[?OutputKey=='PublicIP'].OutputValue" --output text 2>$null
if (-not $PublicIP) {
    Write-Error "No se pudo obtener PublicIP. ¿El stack existe? Ejecuta .\infra\2-get-outputs.ps1"
    exit 1
}
Write-Host "IP: $PublicIP" -ForegroundColor Green

if (-not (Test-Path $KeyFile)) {
    Write-Error "No se encuentra la clave: $KeyFile"
    exit 1
}

$scpArgs = @("-i", $KeyFile, "-o", "StrictHostKeyChecking=accept-new")

function Invoke-Remote {
    param([string]$Cmd)
    $sshArgs = @("-o", "StrictHostKeyChecking=accept-new", "-i", $KeyFile, "${RemoteUser}@${PublicIP}", $Cmd)
    & ssh $sshArgs
}

# --- 1. Instalar Docker en la EC2 ---
Write-Host "`n[1/5] Instalando Docker y Docker Compose en la EC2..." -ForegroundColor Cyan
# En Amazon Linux 2023 no existe docker-compose-plugin en dnf; se instala el binario manualmente
$installDocker = @"
sudo dnf install -y docker && \
sudo systemctl enable docker && \
sudo systemctl start docker && \
sudo usermod -aG docker ec2-user && \
sudo mkdir -p /usr/local/lib/docker/cli-plugins && \
sudo curl -sSL \"https://github.com/docker/compose/releases/latest/download/docker-compose-linux-`$(uname -m)\" -o /usr/local/lib/docker/cli-plugins/docker-compose && \
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose && \
docker --version && docker compose version
"@
Invoke-Remote ($installDocker -replace "`r`n", " ")
if ($LASTEXITCODE -ne 0) { Write-Error "Fallo instalacion Docker"; exit 1 }
# Buildx (requerido por docker compose build 0.17+). Here-string para evitar que PowerShell interprete $ y comillas.
$installBuildx = @"
sudo dnf install -y docker-buildx-plugin 2>/dev/null || (ARCH=`$(uname -m); [ `"`$ARCH`" = x86_64 ] && ARCH=amd64; [ `"`$ARCH`" = aarch64 ] && ARCH=arm64; sudo curl -sSL `"https://github.com/docker/buildx/releases/download/v0.19.3/buildx-v0.19.3.linux-`$ARCH`" -o /usr/local/lib/docker/cli-plugins/docker-buildx && sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx); docker buildx version
"@
Invoke-Remote ($installBuildx -replace "`r`n", " ")
if ($LASTEXITCODE -ne 0) { Write-Host "Aviso: buildx no instalado; el build puede fallar." -ForegroundColor Yellow }
Write-Host "Docker instalado." -ForegroundColor Green

# --- 2. Crear directorio remoto ---
Write-Host "`n[2/5] Creando directorio remoto $RemoteDir..." -ForegroundColor Cyan
Invoke-Remote "mkdir -p $RemoteDir"
if ($LASTEXITCODE -ne 0) { exit 1 }

# --- 3. Copiar proyecto a la EC2 (sin node_modules, .next, .git, etc.) ---
Write-Host "`n[3/5] Copiando proyecto (solo codigo y documentacion, sin node_modules ni builds)..." -ForegroundColor Cyan
$StagingDir = Join-Path $env:TEMP "mcp-deploy-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $StagingDir -Force | Out-Null
Push-Location $ProjectRoot
try {
    Copy-Item docker-compose.yml $StagingDir -Force
    robocopy gateway (Join-Path $StagingDir "gateway") /E /XD node_modules .next .git dist out __pycache__ .venv /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    robocopy webapp (Join-Path $StagingDir "webapp") /E /XD node_modules .next .git dist out /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    if (Test-Path (Join-Path $ProjectRoot "classic")) { robocopy classic (Join-Path $StagingDir "classic") /E /XD .git node_modules dist out /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null }
    if (Test-Path (Join-Path $ProjectRoot "blueivory")) { robocopy blueivory (Join-Path $StagingDir "blueivory") /E /XD .git node_modules dist out /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null }
    robocopy nginx (Join-Path $StagingDir "nginx") /E /XD .git /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    robocopy worker (Join-Path $StagingDir "worker") /E /XD __pycache__ .venv venv .git /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Robocopy fallo" }
    Set-Location $StagingDir
    & scp @scpArgs -r * "${RemoteUser}@${PublicIP}:${RemoteDir}/"
} finally {
    Pop-Location
    Remove-Item $StagingDir -Recurse -Force -ErrorAction SilentlyContinue
}
if ($LASTEXITCODE -ne 0) { Write-Error "Fallo copia del proyecto"; exit 1 }
Write-Host "Proyecto copiado." -ForegroundColor Green

# --- 4. Copiar .env ---
$envLocal = Join-Path $ProjectRoot "gateway\.env"
if (Test-Path $envLocal) {
    Write-Host "`n[4/5] Copiando .env desde gateway/.env..." -ForegroundColor Cyan
    & scp @scpArgs $envLocal "${RemoteUser}@${PublicIP}:${RemoteDir}/.env"
    if ($LASTEXITCODE -ne 0) { Write-Host "Aviso: no se pudo copiar .env. Crealo manualmente en la VM." -ForegroundColor Yellow }
} else {
    Write-Host "`n[4/5] No existe gateway/.env. Crea .env en la VM en $RemoteDir antes de levantar el stack." -ForegroundColor Yellow
}

# --- 5. Levantar Docker Compose en la EC2 ---
Write-Host "`n[5/5] Ejecutando docker compose up -d en la EC2..." -ForegroundColor Cyan
Invoke-Remote "cd $RemoteDir && docker compose up -d --build"
if ($LASTEXITCODE -ne 0) { Write-Error "Fallo docker compose up"; exit 1 }
Write-Host "Stack levantado." -ForegroundColor Green

Write-Host "`nListo. Prueba en el navegador: http://${PublicIP}" -ForegroundColor Green
Write-Host "SSH: ssh -i infra/mcp-server-key.pem ec2-user@${PublicIP}" -ForegroundColor Gray
