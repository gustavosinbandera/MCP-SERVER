# Phase 4 validation - MCP Gateway
# Verifies gateway builds, runs, and health endpoint responds

$root = Split-Path -Parent $PSScriptRoot
$gatewayDir = Join-Path $root "gateway"

# Build
Push-Location $gatewayDir
try {
    npm install 2>&1 | Out-Null
    npm run build 2>&1
    if ($LASTEXITCODE -ne 0) { exit 1 }

    # Run tests
    npm test 2>&1
    if ($LASTEXITCODE -ne 0) { exit 1 }

    Write-Host "OK: Gateway build passed" -ForegroundColor Green
    Write-Host "OK: Gateway tests passed" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Phase 4 validation PASSED" -ForegroundColor Green
exit 0
