# Phase 5 validation - Worker
# Verifies worker validates, and tests pass
# Runs inside Docker (no Python/pytest required on host)

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    # Run pytest; filter Docker Compose "No services to build" warning from stderr
    $pytestOut = docker compose run --rm worker python -m pytest test_worker.py -v 2>&1
    $pytestExit = $LASTEXITCODE
    $pytestOut | Where-Object { $_ -notmatch 'No services to build' } | Write-Host
    if ($pytestExit -ne 0) { exit 1 }
    # Run worker smoke; filter same warning
    $workerOut = docker compose run --rm worker python worker.py 2>&1
    $workerOut | Where-Object { $_ -notmatch 'No services to build' } | Write-Host
    Write-Host "OK: Worker tests passed" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Phase 5 validation PASSED" -ForegroundColor Green
exit 0
