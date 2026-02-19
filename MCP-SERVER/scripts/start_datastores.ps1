# Start datastores (Postgres, Redis, Qdrant)
# Requires: Docker Desktop running
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
# Prefer docker compose v2, fallback to docker-compose
if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker compose up -d
} else {
    Write-Host "Docker not found. Ensure Docker Desktop is installed and in PATH." -ForegroundColor Yellow
    exit 1
}
