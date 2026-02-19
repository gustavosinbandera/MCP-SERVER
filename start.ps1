# MCP Knowledge Hub - Ejecutar todo (sin Docker, sin WSL)
# Requiere: Node.js y Python instalados en Windows
# Uso: powershell -ExecutionPolicy Bypass -File start.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# Verificar Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js no encontrado. Instalalo desde https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Verificar Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Python no encontrado. Instalalo desde https://python.org/" -ForegroundColor Red
    exit 1
}

Write-Host "Iniciando MCP Knowledge Hub (modo desarrollo, sin Docker)..." -ForegroundColor Cyan

# Gateway
Write-Host "`n[1/3] Gateway..." -ForegroundColor Gray
$gatewayDir = Join-Path $root "gateway"
if (-not (Test-Path (Join-Path $gatewayDir "node_modules"))) {
    Set-Location $gatewayDir; npm install 2>&1 | Out-Null; Set-Location $root
}
if (-not (Test-Path (Join-Path $gatewayDir "dist\index.js"))) {
    Set-Location $gatewayDir; npm run build 2>&1 | Out-Null; Set-Location $root
}
Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory $gatewayDir -WindowStyle Hidden

# Webapp (apuntando al gateway)
Write-Host "[2/3] Webapp..." -ForegroundColor Gray
$webappDir = Join-Path $root "webapp"
$env:NEXT_PUBLIC_GATEWAY_URL = "http://localhost:3001"
if (-not (Test-Path (Join-Path $webappDir "node_modules"))) {
    Set-Location $webappDir
    npm install 2>&1 | Out-Null
    Set-Location $root
}
Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory $webappDir -WindowStyle Hidden

# Worker
Write-Host "[3/3] Worker..." -ForegroundColor Gray
$workerDir = Join-Path $root "worker"
python (Join-Path $workerDir "worker.py") 2>$null | Out-Null

Start-Sleep -Seconds 3

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  MCP Knowledge Hub - LISTO" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Webapp:  http://localhost:3000" -ForegroundColor White
Write-Host "  Gateway: http://localhost:3001/health" -ForegroundColor White
Write-Host "`n  Los procesos siguen en segundo plano." -ForegroundColor Gray
Write-Host "  Para detener: cierra esta ventana o mata los procesos node/npm." -ForegroundColor Gray
