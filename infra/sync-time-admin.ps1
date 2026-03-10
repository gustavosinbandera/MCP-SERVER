# Sincronizar hora de Windows (ejecutar como Administrador)
# Útil cuando Starlink u otra red retrasa la sincronización automática.
# Clic derecho en el script -> "Ejecutar con PowerShell" (o abrir PowerShell como Admin y ejecutar).

$ErrorActionPreference = 'Stop'
Write-Host "Hora antes:  $(Get-Date -Format 'o')"

# Iniciar servicio de hora de Windows
Set-Service W32Time -StartupType Automatic -ErrorAction SilentlyContinue
Start-Service W32Time -ErrorAction SilentlyContinue

# Forzar sincronización con time.windows.com (suele funcionar mejor que el predeterminado con Starlink)
w32tm /config /manualpeerlist:"time.windows.com" /syncfromflags:manual /reliable:yes /update
w32tm /resync

Write-Host "Hora después: $(Get-Date -Format 'o')"
Write-Host "Listo. Prueba: aws sts get-caller-identity"
