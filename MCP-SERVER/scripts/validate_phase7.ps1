# Phase 7 validation - Webapp minimal UI
# Verifies Next.js app builds

$root = Split-Path -Parent $PSScriptRoot
$webappDir = Join-Path $root "webapp"

Push-Location $webappDir
try {
    npm install 2>&1 | Out-Null
    npm run build 2>&1
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host "OK: Webapp build passed" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Phase 7 validation PASSED" -ForegroundColor Green
exit 0
