# MCP Knowledge Hub - Eliminar stack CloudFormation (sin argumentos)
# Uso: .\infra\delete-stack.ps1

$ErrorActionPreference = "Stop"
$StackName = "mcp-hub-infra"

Write-Host "Eliminando stack: $StackName" -ForegroundColor Yellow
aws cloudformation delete-stack --stack-name $StackName
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Stack en eliminacion. Comprueba en la consola AWS o con: aws cloudformation describe-stacks --stack-name $StackName" -ForegroundColor Green
