# MCP Knowledge Hub - Ejecutar accion de infraestructura (sin argumentos extra)
# Uso: .\infra\run.ps1 create   -> crea el stack
#       .\infra\run.ps1 status   -> muestra estado y outputs
#       .\infra\run.ps1 delete  -> elimina el stack

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("create", "status", "delete")]
    [string]$Action
)

$ScriptDir = $PSScriptRoot
switch ($Action) {
    "create"  { & (Join-Path $ScriptDir "create-stack.ps1") }
    "status"  { & (Join-Path $ScriptDir "get-outputs.ps1") }
    "delete"  { & (Join-Path $ScriptDir "delete-stack.ps1") }
}
