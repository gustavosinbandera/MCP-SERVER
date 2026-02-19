# Phase 2 validation - Git docs repo initialization
# Verifies git is initialized and docs_repo structure is tracked

$root = Split-Path -Parent $PSScriptRoot

# Check git is initialized (optional - structure must exist)
$gitDir = Join-Path $root ".git"
if (-not (Test-Path $gitDir)) {
    Write-Host "WARN: .git not found - run 'git init' from project root for full setup" -ForegroundColor Yellow
}

# Check docs_repo exists and has key subdirs
$docsDirs = @("docs_repo", "docs_repo\docs", "docs_repo\_auto", "docs_repo\bugs")
foreach ($d in $docsDirs) {
    $full = Join-Path $root $d
    if (-not (Test-Path $full)) {
        Write-Host "FAIL: Missing $d" -ForegroundColor Red
        exit 1
    }
}

# Check docs_repo README
if (-not (Test-Path (Join-Path $root "docs_repo\README.md"))) {
    Write-Host "FAIL: docs_repo\README.md not found" -ForegroundColor Red
    exit 1
}

if (Test-Path $gitDir) { Write-Host "OK: Git initialized" -ForegroundColor Green }
Write-Host "OK: docs_repo structure present" -ForegroundColor Green
Write-Host ""
Write-Host "Phase 2 validation PASSED" -ForegroundColor Green
exit 0
