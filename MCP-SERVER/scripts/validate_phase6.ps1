# Phase 6 validation - Search with Qdrant
# Verifies search endpoint and gateway tests pass

$root = Split-Path -Parent $PSScriptRoot
$gatewayDir = Join-Path $root "gateway"

Push-Location $gatewayDir
try {
    npm run build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { exit 1 }
    npm test 2>&1
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host "OK: Search implementation verified" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Phase 6 validation PASSED" -ForegroundColor Green
exit 0
