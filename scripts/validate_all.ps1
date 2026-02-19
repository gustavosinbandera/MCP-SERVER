# Run all phase validations (0..8 per Master Prompt)
$root = Split-Path -Parent $PSScriptRoot
$scripts = @(
    "validate_phase0.ps1",
    "validate_phase1.ps1",
    "validate_phase2.ps1",
    "validate_phase3.ps1",
    "validate_phase4.ps1",
    "validate_phase5.ps1",
    "validate_phase6.ps1",
    "validate_phase7.ps1",
    "validate_phase8.ps1"
)

foreach ($s in $scripts) {
    $path = Join-Path $root "scripts\$s"
    Write-Host "`n--- $s ---" -ForegroundColor Cyan
    & powershell -ExecutionPolicy Bypass -File $path
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

Write-Host "`n=== All validations passed ===" -ForegroundColor Green
