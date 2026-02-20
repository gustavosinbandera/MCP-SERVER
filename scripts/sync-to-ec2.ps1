# Sincronización del repo MCP a la instancia EC2 por SSH
# - Envía solo cambios (git push + git pull en remoto)
# - Copia la documentación de cambios (deploy-docs/*.md) a INDEX_INBOX para indexación
# - Opcional: genera changelog desde último sync y lo sube como doc para indexar
#
# Uso: .\scripts\sync-to-ec2.ps1
#       .\scripts\sync-to-ec2.ps1 -SkipPush        # solo pull + docs (sin push)
#       .\scripts\sync-to-ec2.ps1 -SkipDeployDocs  # solo repo, no subir .md
# Requiere: sync-config.json (copiar desde sync-config.example.json) con sshKeyPath, ec2Host, remoteRepoPath, etc.

param(
    [switch]$SkipPush,
    [switch]$SkipDeployDocs,
    [switch]$Changelog  # genera y sube un changelog desde el último sync (git log) para indexar
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir

# Cargar config
$configPath = Join-Path $ScriptDir "sync-config.json"
if (-not (Test-Path $configPath)) {
    Write-Host "No se encontró sync-config.json. Copia scripts/sync-config.example.json a scripts/sync-config.json y ajusta rutas/host." -ForegroundColor Yellow
    exit 1
}
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$keyPath = $config.sshKeyPath
$ec2Host = $config.ec2Host
$remoteRepo = $config.remoteRepoPath
$remoteInbox = $config.remoteIndexInboxPath
$branch = if ($config.branch) { $config.branch } else { "master" }

if (-not (Test-Path $keyPath)) {
    Write-Host "Clave SSH no encontrada: $keyPath" -ForegroundColor Red
    exit 1
}

# Repo root debe ser git
Push-Location $RepoRoot
try {
    $currentCommit = (git rev-parse HEAD 2>$null)
    if (-not $currentCommit) {
        Write-Host "No es un repositorio git o no hay HEAD." -ForegroundColor Red
        exit 1
    }

    # 1) Git push (para que el remoto tenga los cambios)
    if (-not $SkipPush) {
        Write-Host "[1/4] Git push origin $branch..." -ForegroundColor Cyan
        & git push origin $branch 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Git push falló. ¿Tienes remote 'origin' y permisos?" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[1/4] Skip push (SkipPush)." -ForegroundColor Gray
    }

    # 2) En el servidor: git pull y leer último sync (para changelog)
    Write-Host "[2/5] SSH: git pull en $ec2Host..." -ForegroundColor Cyan
    $getLastSync = "cd $remoteRepo && cat .last-sync-commit 2>/dev/null || echo ''"
    $lastSyncCommit = (& ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i $keyPath $ec2Host $getLastSync 2>$null) -replace '\s+',''
    $pullCmd = "cd $remoteRepo && git pull origin $branch 2>&1 || true"
    & ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i $keyPath $ec2Host $pullCmd

    # 2b) Changelog desde último sync (qué soluciona cada commit) para indexar
    if ($Changelog -and $lastSyncCommit -and (git rev-parse --verify $lastSyncCommit 2>$null)) {
        Write-Host "[3/5] Generando changelog (git log) para indexación..." -ForegroundColor Cyan
        $log = & git log --format="## %h %s%n%b" $lastSyncCommit..HEAD 2>$null
        $dateStr = Get-Date -Format "yyyy-MM-dd-HHmm"
        $changelogPath = Join-Path $RepoRoot (Join-Path "deploy-docs" "sync-changelog-$dateStr.md")
        $header = "# Changelog sync $dateStr`n`nResumen de commits en este deploy (para indexación):`n`n"
        Set-Content -Path $changelogPath -Value ($header + $log) -Encoding UTF8
        & scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i $keyPath $changelogPath "${ec2Host}:${remoteInbox}/sync-changelog-$dateStr.md" 2>&1
        Write-Host "  - sync-changelog-$dateStr.md" -ForegroundColor Gray
        Remove-Item $changelogPath -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "[3/5] Changelog omitido (usa -Changelog para generar desde último sync)." -ForegroundColor Gray
    }

    # 4) Subir documentación de cambios a INDEX_INBOX
    $deployDocsDir = Join-Path $RepoRoot "deploy-docs"
    $markdownFiles = @()
    if (Test-Path $deployDocsDir) {
        $markdownFiles = Get-ChildItem -Path $deployDocsDir -Filter "*.md" -Recurse -File | Where-Object { $_.Name -ne "README.md" }
    }
    if (-not $SkipDeployDocs -and $markdownFiles.Count -gt 0) {
        Write-Host "[4/5] Subiendo $($markdownFiles.Count) doc(s) a INDEX_INBOX para indexación..." -ForegroundColor Cyan
        foreach ($f in $markdownFiles) {
            $dest = "${ec2Host}:${remoteInbox}/$($f.Name)"
            & scp -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i $keyPath $f.FullName $dest 2>&1
            Write-Host "  - $($f.Name)" -ForegroundColor Gray
        }
    } else {
        if ($SkipDeployDocs) { Write-Host "[4/5] Skip deploy-docs." -ForegroundColor Gray }
        else { Write-Host "[4/5] No hay .md en deploy-docs (excl. README) para subir." -ForegroundColor Gray }
    }

    # 5) Guardar commit actual como último sync (para changelog futuro)
    Write-Host "[5/5] Guardando commit de sync en remoto..." -ForegroundColor Cyan
    & ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i $keyPath $ec2Host "echo $currentCommit > $remoteRepo/.last-sync-commit"

    Write-Host "Sync completado. Commit: $($currentCommit.Substring(0,7))" -ForegroundColor Green
    Write-Host "Los .md enviados a INDEX_INBOX serán indexados en el próximo ciclo del supervisor." -ForegroundColor Gray
}
finally {
    Pop-Location
}
