# Phase 1 validation - Datastores (Postgres, Redis, Qdrant)
# Verifies all three datastores are running and reachable
# Prerequisites: Run "docker compose up -d" from project root first

$root = Split-Path -Parent $PSScriptRoot
$ErrorActionPreference = "Stop"

function Test-Postgres {
    try {
        docker exec mcp-postgres pg_isready -U postgres -d mcp_hub 2>&1 | Out-Null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

function Test-Redis {
    try {
        $r = docker exec mcp-redis redis-cli ping 2>&1
        return $r -match "PONG"
    } catch { return $false }
}

function Test-Qdrant {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:6333/" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
        return $response.StatusCode -eq 200
    } catch { return $false }
}

Write-Host "Phase 1 - Datastores validation" -ForegroundColor Cyan
Write-Host ""

# Check containers are running
$containers = @("mcp-postgres", "mcp-redis", "mcp-qdrant")
foreach ($c in $containers) {
    $status = docker inspect -f '{{.State.Running}}' $c 2>$null
    if ($status -ne "true") {
        Write-Host "FAIL: Container $c is not running" -ForegroundColor Red
        exit 1
    }
}

# Test Postgres
if (Test-Postgres) {
    Write-Host "OK: Postgres is ready" -ForegroundColor Green
} else {
    Write-Host "FAIL: Postgres not ready" -ForegroundColor Red
    exit 1
}

# Test Redis
if (Test-Redis) {
    Write-Host "OK: Redis is ready" -ForegroundColor Green
} else {
    Write-Host "FAIL: Redis not ready" -ForegroundColor Red
    exit 1
}

# Test Qdrant
if (Test-Qdrant) {
    Write-Host "OK: Qdrant is ready" -ForegroundColor Green
} else {
    Write-Host "FAIL: Qdrant not ready" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Phase 1 validation PASSED" -ForegroundColor Green
exit 0
