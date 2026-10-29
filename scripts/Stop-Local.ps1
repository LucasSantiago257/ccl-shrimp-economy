$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
    docker compose down
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao parar o ambiente.' }
    Write-Host 'Serviços parados. Os dados continuam no volume do MySQL.'
} finally { Pop-Location }
