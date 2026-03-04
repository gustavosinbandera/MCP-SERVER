# Crear base de datos y usuario keycloak en Postgres (ejecutar una vez con Docker levantado).
# Uso: .\scripts\create-keycloak-db.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

# Cargar KEYCLOAK_DB_PASSWORD desde .env
$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) { throw ".env no encontrado en $root" }
$pass = (Get-Content $envFile -Raw) -replace '(?s).*KEYCLOAK_DB_PASSWORD=(\S+).*','$1'
$pass = $pass.Trim()
if (-not $pass) { throw "KEYCLOAK_DB_PASSWORD no definido en .env" }

# Escapar comilla simple para psql: ' -> ''
$passEsc = $pass -replace "'", "''"

docker compose exec -T postgres psql -U postgres -d mcp_hub -c "CREATE ROLE keycloak WITH LOGIN PASSWORD 'CHANGE_ME_KEYCLOAK_DB_PASS';"
docker compose exec -T postgres psql -U postgres -d mcp_hub -c "CREATE DATABASE keycloak OWNER keycloak;"
docker compose exec -T postgres psql -U postgres -d mcp_hub -c "GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;"
docker compose exec -T postgres psql -U postgres -d mcp_hub -c "ALTER ROLE keycloak PASSWORD '$passEsc';"
Write-Host "Base de datos keycloak y usuario creados."
Write-Host "Arrancar Keycloak: docker compose up -d keycloak"
