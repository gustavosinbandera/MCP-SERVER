# MCP Knowledge Hub - Crear stack CloudFormation (sin argumentos)
# Uso: .\infra\create-stack.ps1
# Requiere: AWS CLI configurado, infra/parameters.json e infra/mcp-ec2.yaml

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$ProjectRoot = Split-Path $ScriptDir -Parent
$StackName = "mcp-hub-infra"
$TemplateFile = Join-Path $ScriptDir "mcp-ec2.yaml"
$ParametersFile = Join-Path $ScriptDir "parameters.json"

if (-not (Test-Path $TemplateFile)) {
    Write-Error "No se encuentra el template: $TemplateFile"
    exit 1
}
if (-not (Test-Path $ParametersFile)) {
    Write-Error "No se encuentra parameters.json. Copia parameters.example.json a parameters.json y edita KeyName."
    exit 1
}

Set-Location $ProjectRoot
$templateBody = "file://infra/mcp-ec2.yaml"
$parametersBody = "file://infra/parameters.json"

Write-Host "Creando stack: $StackName" -ForegroundColor Cyan
Write-Host "Template: $TemplateFile" -ForegroundColor Gray
Write-Host "Parametros: $ParametersFile" -ForegroundColor Gray

try {
    aws cloudformation create-stack `
        --stack-name $StackName `
        --template-body $templateBody `
        --parameters $parametersBody
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "Stack en creacion. Para ver estado y IP: .\infra\get-outputs.ps1" -ForegroundColor Green
} catch {
    Write-Error $_
    exit 1
}
