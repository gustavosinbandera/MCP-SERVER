# Registrar auth.domoticore.co en Route 53 (misma IP que la EC2)
# Uso: .\infra\5b-route53-auth.ps1
# Requiere: AWS CLI configurado, mismo HostedZoneId que mcp.domoticore.co

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
$StackName = "mcp-hub-infra"
$RecordName = "auth.domoticore.co"
$HostedZoneId = "Z083277923JH700C12KXD"   # domoticore.co

Write-Host "Obteniendo IP del stack $StackName..." -ForegroundColor Cyan
$PublicIP = aws cloudformation describe-stacks --stack-name $StackName --query "Stacks[0].Outputs[?OutputKey=='PublicIP'].OutputValue" --output text 2>$null
if (-not $PublicIP) {
    Write-Error "No se pudo obtener PublicIP. Ejecuta .\infra\2-get-outputs.ps1"
    exit 1
}
Write-Host "IP del stack: $PublicIP" -ForegroundColor Green

Write-Host "Creando/actualizando registro A $RecordName -> $PublicIP" -ForegroundColor Cyan

$ProjectRoot = Split-Path $ScriptDir -Parent
$ChangeBatchPath = Join-Path $ProjectRoot "infra\route53-auth-record-temp.json"
$ChangeBatch = @"
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "$RecordName",
        "Type": "A",
        "TTL": 300,
        "ResourceRecords": [{ "Value": "$PublicIP" }]
      }
    }
  ]
}
"@
[System.IO.File]::WriteAllText($ChangeBatchPath, $ChangeBatch, [System.Text.UTF8Encoding]::new($false))

try {
    Push-Location $ProjectRoot
    aws route53 change-resource-record-sets --hosted-zone-id $HostedZoneId --change-batch file://infra/route53-auth-record-temp.json
    if ($LASTEXITCODE -ne 0) { throw "Fallo change-resource-record-sets" }
    Write-Host "Registro actualizado. $RecordName -> $PublicIP" -ForegroundColor Green
    Write-Host "URL: https://$RecordName" -ForegroundColor Gray
} finally {
    Pop-Location
    Remove-Item $ChangeBatchPath -Force -ErrorAction SilentlyContinue
}
