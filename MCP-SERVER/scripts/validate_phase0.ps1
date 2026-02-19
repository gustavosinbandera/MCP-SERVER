# Phase 0 validation - Skeleton structure
# Verifies all required directories and files exist

$root = Split-Path -Parent $PSScriptRoot
$required = @(
    "docker-compose.yml",
    ".env.example",
    "README.md",
    "gateway\.gitkeep",
    "worker\.gitkeep",
    "webapp\package.json",
    "nginx\.gitkeep",
    "scripts\.gitkeep",
    "docs_repo\docs\.gitkeep",
    "docs_repo\bugs\.gitkeep",
    "docs_repo\_auto\.gitkeep",
    "docs_repo\flows\.gitkeep",
    "docs_repo\adr\.gitkeep",
    "docs_repo\company_projects\.gitkeep",
    "docs_repo\staging\.gitkeep",
    "docs_repo\inbox\.gitkeep",
    "docs_repo\processed\.gitkeep"
)

$failed = 0
foreach ($path in $required) {
    $full = Join-Path $root $path
    if (-not (Test-Path $full)) {
        Write-Host "FAIL: Missing $path" -ForegroundColor Red
        $failed++
    } else {
        Write-Host "OK: $path" -ForegroundColor Green
    }
}

if ($failed -gt 0) {
    Write-Host "`nPhase 0 validation FAILED: $failed missing item(s)" -ForegroundColor Red
    exit 1
}
Write-Host "`nPhase 0 validation PASSED" -ForegroundColor Green
exit 0
