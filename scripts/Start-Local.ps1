$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
if (!(Test-Path -LiteralPath (Join-Path $projectDir '.env'))) { & (Join-Path $PSScriptRoot 'Initialize-Local.ps1') }
Push-Location $projectDir
try {
    docker info --format '{{.ServerVersion}}'
    if ($LASTEXITCODE -ne 0) { throw 'Abra o Docker Desktop e aguarde o motor Linux iniciar.' }
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar. Consulte docker compose logs.' }
    Write-Host 'Aplicação iniciada. Endereço padrão: http://localhost:5173'
    Write-Host 'Usuário e senha: APP_ADMIN_USERNAME e APP_ADMIN_PASSWORD no arquivo .env.'
    Write-Host 'Aguarde o back-end terminar de iniciar antes do primeiro acesso.'
} finally { Pop-Location }
