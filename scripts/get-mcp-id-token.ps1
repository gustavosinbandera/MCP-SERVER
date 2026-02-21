# Obtiene un IdToken de Cognito para MCP (Cursor streamable-http).
# Opción A: Con refresh token (válido 60 días) - no pide contraseña.
# Opción B: Con usuario y contraseña (USER_PASSWORD_AUTH).
#
# Uso con refresh token (recomendado para test de 2 meses):
#   1. Primera vez: .\scripts\get-mcp-id-token.ps1 -Login
#      Te pide email y contraseña, devuelve IdToken y guarda RefreshToken en $env:USERPROFILE\.mcp-cognito-refresh
#   2. Siguientes veces: .\scripts\get-mcp-id-token.ps1
#      Lee el refresh token guardado y devuelve un IdToken nuevo (válido 1 h). Puedes usarlo 60 días sin volver a poner contraseña.
#
# Uso con usuario/contraseña (guarda RefreshToken para los próximos 60 días):
#   .\scripts\get-mcp-id-token.ps1 -Email "mcp-test@domoticore.co" -Password "MCPtest123!"
#
# Salida: imprime solo el IdToken (para copiar a mcp.json o Authorization: Bearer ...).

param(
    [switch]$Login,
    [string]$Email,
    [string]$Password
)

$Region = "us-east-1"
$ClientId = "7p5dfh0r8822uluda86u24edp8"
$RefreshFile = Join-Path $env:USERPROFILE ".mcp-cognito-refresh"

if ($Login) {
    $e = Read-Host "Email (Cognito)"
    $p = Read-Host "Password" -AsSecureString
    $PasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p))
    $auth = aws cognito-idp initiate-auth --region $Region --auth-flow USER_PASSWORD_AUTH --client-id $ClientId `
        --auth-parameters "USERNAME=$e,PASSWORD=$PasswordPlain" --output json 2>$null
    if (-not $auth) {
        Write-Error "Login falló. Revisa usuario/contraseña y que el client permita USER_PASSWORD_AUTH."
        exit 1
    }
    $obj = $auth | ConvertFrom-Json
    $idToken = $obj.AuthenticationResult.IdToken
    $refreshToken = $obj.AuthenticationResult.RefreshToken
    if ($refreshToken) {
        $refreshToken | Out-File -FilePath $RefreshFile -Encoding utf8 -NoNewline
        Write-Host "RefreshToken guardado en $RefreshFile (válido 60 días)." -ForegroundColor Gray
    }
    Write-Host $idToken
    exit 0
}

if ($Email -and $Password) {
    $auth = aws cognito-idp initiate-auth --region $Region --auth-flow USER_PASSWORD_AUTH --client-id $ClientId `
        --auth-parameters "USERNAME=$Email,PASSWORD=$Password" --output json 2>$null
    if (-not $auth) { Write-Error "Login falló"; exit 1 }
    $obj = $auth | ConvertFrom-Json
    $idToken = $obj.AuthenticationResult.IdToken
    $refreshToken = $obj.AuthenticationResult.RefreshToken
    if ($refreshToken) {
        $refreshToken | Out-File -FilePath $RefreshFile -Encoding utf8 -NoNewline
        Write-Host "RefreshToken guardado en $RefreshFile (válido 60 días)." -ForegroundColor Gray
    }
    Write-Host $idToken
    exit 0
}

# Por defecto: usar refresh token guardado
if (-not (Test-Path $RefreshFile)) {
    Write-Host "No hay refresh token guardado. Ejecuta: .\scripts\get-mcp-id-token.ps1 -Login" -ForegroundColor Yellow
    exit 1
}
$refreshToken = Get-Content $RefreshFile -Raw
$auth = aws cognito-idp initiate-auth --region $Region --auth-flow REFRESH_TOKEN_AUTH --client-id $ClientId `
    --auth-parameters "REFRESH_TOKEN=$refreshToken" --output json 2>$null
if (-not $auth) {
    Write-Host "Refresh token expirado o inválido. Ejecuta de nuevo: .\scripts\get-mcp-id-token.ps1 -Login" -ForegroundColor Yellow
    exit 1
}
$idToken = ($auth | ConvertFrom-Json).AuthenticationResult.IdToken
Write-Host $idToken
