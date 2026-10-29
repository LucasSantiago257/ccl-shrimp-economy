$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectDir '.env'
if (Test-Path -LiteralPath $envPath) {
    Write-Host 'O arquivo .env já existe. Nenhuma credencial foi alterada.'
    exit 0
}
function New-Secret {
    $bytes = New-Object byte[] 24
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}
$lines = @(
    'MYSQL_DATABASE=camarao', 'MYSQL_USER=camarao',
    "MYSQL_PASSWORD=$(New-Secret)", "MYSQL_ROOT_PASSWORD=$(New-Secret)",
    'APP_ADMIN_USERNAME=admin', "APP_ADMIN_PASSWORD=$(New-Secret)",
    'APP_PORT=8080', 'WEB_PORT=5173'
)
[System.IO.File]::WriteAllLines($envPath, $lines, (New-Object System.Text.UTF8Encoding $false))
Write-Host 'Arquivo .env criado. Consulte nele o usuário e a senha locais. Não o envie ao Git.'
