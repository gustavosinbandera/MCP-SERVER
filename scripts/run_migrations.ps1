# Run Postgres migrations
# Requires: Docker with mcp-postgres running
param(
    [string]$Host = "localhost",
    [string]$Port = "5432",
    [string]$User = "postgres",
    [string]$Db = "mcp_hub",
    [string]$Password = "postgres"
)

$root = Split-Path -Parent $PSScriptRoot
$sqlDir = Join-Path $root "scripts\sql"
$env:PGPASSWORD = $Password

$files = Get-ChildItem -Path $sqlDir -Filter "*.sql" | Sort-Object Name
foreach ($f in $files) {
    Write-Host "Running $($f.Name)..."
    psql -h $Host -p $Port -U $User -d $Db -f $f.FullName 2>&1
    if ($LASTEXITCODE -ne 0) { exit 1 }
}
Write-Host "Migrations complete."
