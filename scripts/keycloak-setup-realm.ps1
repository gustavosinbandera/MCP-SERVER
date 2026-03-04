# Crear realm mcp y usuario mcp-test en Keycloak (ejecutar una vez con Keycloak levantado).
# Uso: .\scripts\keycloak-setup-realm.ps1
# Opcional: $env:MCP_TEST_USER_PASSWORD = "tu-password"; .\scripts\keycloak-setup-realm.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$pass = $env:KEYCLOAK_ADMIN_PASSWORD
if (-not $pass) {
    $envFile = Join-Path $root ".env"
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^KEYCLOAK_ADMIN_PASSWORD=' }
        if ($line) { $pass = $line -replace '^KEYCLOAK_ADMIN_PASSWORD=', '' }
    }
}
if (-not $pass) { throw "KEYCLOAK_ADMIN_PASSWORD no definido en .env o en env" }

$testUserPass = $env:MCP_TEST_USER_PASSWORD
if (-not $testUserPass) { $testUserPass = "change-me-mcp-test" }

$adminUser = $env:KEYCLOAK_ADMIN
if (-not $adminUser) {
    $envFile = Join-Path $root ".env"
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match '^KEYCLOAK_ADMIN=' }
        if ($line) { $adminUser = $line -replace '^KEYCLOAK_ADMIN=', '' }
    }
}
if (-not $adminUser) { $adminUser = "admin" }

Write-Host "Creando realm mcp..."
docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user $adminUser --password $pass 2>$null
docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh create realms -s realm=mcp -s enabled=true
if ($LASTEXITCODE -ne 0) {
    Write-Host "Realm mcp puede ya existir. Continuando..."
}

Write-Host "Creando usuario mcp-test..."
$createUser = 'create users -r mcp -s username=mcp-test -s enabled=true'
docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user $adminUser --password $pass 2>$null
docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh create users -r mcp -s username=mcp-test -s enabled=true
if ($LASTEXITCODE -ne 0) {
    Write-Host "Usuario mcp-test puede ya existir."
}

Write-Host "Estableciendo password para mcp-test..."
docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user $adminUser --password $pass 2>$null
docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh set-password -r mcp --username mcp-test --new-password $testUserPass
Write-Host "Listo. Realm mcp y usuario mcp-test (password: $testUserPass) creados."
Write-Host "Admin: https://auth.domoticore.co (usuario $adminUser)."
