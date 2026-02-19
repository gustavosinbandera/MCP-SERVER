# Phase 3 validation - Postgres schema for traceability
# Verifies schema exists (submissions, trace_logs tables)
# Requires: mcp-postgres container running

$root = Split-Path -Parent $PSScriptRoot

# Check schema file exists
$sqlFile = Join-Path $root "scripts\sql\001_traceability_schema.sql"
if (-not (Test-Path $sqlFile)) {
    Write-Host "FAIL: Migration file not found" -ForegroundColor Red
    exit 1
}
Write-Host "OK: Migration file exists" -ForegroundColor Green

# Try docker exec to verify schema (when Postgres is running)
$checkSql = "SELECT count(*) FROM information_schema.tables WHERE table_name IN ('submissions','trace_logs');"
$result = docker exec mcp-postgres psql -U postgres -d mcp_hub -t -A -c $checkSql 2>&1

if ($LASTEXITCODE -ne 0 -or -not $result) {
    Write-Host "WARN: Postgres not available. Run 'docker compose up -d' and apply: Get-Content scripts\sql\001_traceability_schema.sql | docker exec -i mcp-postgres psql -U postgres -d mcp_hub" -ForegroundColor Yellow
    Write-Host "Phase 3: Schema files created. Validation when Postgres available." -ForegroundColor Yellow
    exit 0
}

$count = [int]($result.Trim())
if ($count -ge 2) {
    Write-Host "OK: submissions table exists" -ForegroundColor Green
    Write-Host "OK: trace_logs table exists" -ForegroundColor Green
    Write-Host ""
    Write-Host "Phase 3 validation PASSED" -ForegroundColor Green
    exit 0
}

Write-Host "FAIL: Schema not applied. Run migrations." -ForegroundColor Red
exit 1
