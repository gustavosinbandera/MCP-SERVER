# Obtener certificado Let's Encrypt para auth.domoticore.co
# Requisitos: DNS auth.domoticore.co apuntando a esta máquina; puerto 80 accesible.
# Uso: .\scripts\obtain-auth-cert.ps1 -Email "tu@email.com"

param(
    [Parameter(Mandatory=$true)]
    [string]$Email
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d auth.domoticore.co --email $Email --agree-tos --non-interactive
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Certificado creado. Si nginx usa auth.domoticore.co-0001, renombra o actualiza nginx.conf y reinicia: docker compose restart nginx"
