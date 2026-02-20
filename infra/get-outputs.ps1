# MCP Knowledge Hub - Ver estado y outputs del stack (sin argumentos)
# Uso: .\infra\get-outputs.ps1

$ErrorActionPreference = "Stop"
$StackName = "mcp-hub-infra"

Write-Host "Stack: $StackName" -ForegroundColor Cyan
$status = aws cloudformation describe-stacks --stack-name $StackName --query "Stacks[0].StackStatus" --output text 2>$null
if (-not $status) {
    Write-Host "El stack no existe o aun no esta creado." -ForegroundColor Yellow
    exit 0
}
Write-Host "Estado: $status" -ForegroundColor $(if ($status -eq "CREATE_COMPLETE" -or $status -eq "UPDATE_COMPLETE") { "Green" } else { "Yellow" })
Write-Host ""

Write-Host "Outputs:" -ForegroundColor Cyan
aws cloudformation describe-stacks --stack-name $StackName --query "Stacks[0].Outputs" --output table
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$ip = aws cloudformation describe-stacks --stack-name $StackName --query "Stacks[0].Outputs[?OutputKey=='PublicIP'].OutputValue" --output text 2>$null
if ($ip) {
    Write-Host ""
    Write-Host "SSH: ssh -i infra/mcp-server-key.pem ec2-user@$ip" -ForegroundColor Green
}
