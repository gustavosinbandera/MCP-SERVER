# Sincroniza el repo a EC2 (git push + pull en remoto) y ejecuta el deploy OAuth/HTTPS:
# reinicia Keycloak y nginx, verifica discovery con https.
# Requiere: scripts/sync-config.json (sshKeyPath, ec2Host, remoteRepoPath)
# Uso: .\scripts\run-deploy-oauth-https.ps1

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir

$configPath = Join-Path $ScriptDir "sync-config.json"
if (-not (Test-Path $configPath)) {
    Write-Host "No se encontró scripts/sync-config.json. No puedo conectar a EC2." -ForegroundColor Yellow
    Write-Host "Copia scripts/sync-config.example.json a scripts/sync-config.json y ajusta ec2Host, sshKeyPath, remoteRepoPath." -ForegroundColor Gray
    Write-Host "Luego, en la EC2 (ssh manual), ejecuta:" -ForegroundColor Cyan
    Write-Host "  cd ~/MCP-SERVER && git pull && bash scripts/ec2/deploy-oauth-https.sh" -ForegroundColor White
    exit 1
}

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$keyPath = $config.sshKeyPath
$ec2Host = $config.ec2Host
$remoteRepo = $config.remoteRepoPath
$branch = if ($config.branch) { $config.branch } else { "master" }

if (-not (Test-Path $keyPath)) {
    Write-Host "Clave SSH no encontrada: $keyPath" -ForegroundColor Red
    exit 1
}

Push-Location $RepoRoot
try {
    Write-Host "[1/3] Git push y pull en EC2..." -ForegroundColor Cyan
    $ErrorActionPreference = 'Continue'
    try { & git push origin $branch 2>&1 | Out-Null } catch {}
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0) { Write-Host "  (push falló; ¿hay commit de los cambios?)" -ForegroundColor Gray }
    $pullCmd = "cd $remoteRepo && git pull origin $branch 2>&1 || true"
    & ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i $keyPath $ec2Host $pullCmd

    Write-Host "[2/3] Ejecutando deploy OAuth/HTTPS en EC2 (Keycloak + nginx + verificación)..." -ForegroundColor Cyan
    $deployCmd = "cd $remoteRepo && bash scripts/ec2/deploy-oauth-https.sh"
    & ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i $keyPath $ec2Host $deployCmd

    Write-Host "[3/3] Hecho. Prueba el conector OAuth en ChatGPT." -ForegroundColor Green
} finally {
    Pop-Location
}
