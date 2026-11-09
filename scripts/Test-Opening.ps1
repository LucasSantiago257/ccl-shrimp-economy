param([string]$Maven = 'mvn', [string]$MavenRepository = '')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$testProject = 'camarao-opening-test-' + (Get-Date -Format 'yyyyMMddHHmmss')
$config = @{}
Get-Content -LiteralPath (Join-Path $projectRoot '.env') | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') { $config[$Matches[1]] = $Matches[2] }
}
$variables = @{
    OPENING_DB_TEST = 'true'
    DB_USER = $config['MYSQL_USER']
    DB_PASSWORD = $config['MYSQL_PASSWORD']
    APP_ADMIN_USERNAME = $config['APP_ADMIN_USERNAME']
    APP_ADMIN_PASSWORD = $config['APP_ADMIN_PASSWORD']
}
$previous = @{}
foreach ($name in $variables.Keys) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
Push-Location $projectRoot
try {
    docker compose -p $testProject -f compose.yaml -f compose.automatic-test.yaml up -d --wait mysql
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível iniciar o MySQL isolado na porta 13307.' }
    foreach ($name in $variables.Keys) { [Environment]::SetEnvironmentVariable($name, $variables[$name], 'Process') }
    $arguments = @('-B', '-f', 'backend/pom.xml', '-Dtest=OpeningDatabaseTest')
    if ($MavenRepository) { $arguments += "-Dmaven.repo.local=$MavenRepository" }
    & $Maven @arguments test
    if ($LASTEXITCODE -ne 0) { throw 'Falha no teste de implantação.' }
} finally {
    try {
        docker compose -p $testProject -f compose.yaml -f compose.automatic-test.yaml down
        if ($LASTEXITCODE -ne 0) { throw "Não foi possível encerrar os contêineres de $testProject." }
        Write-Host "Volume de teste preservado: ${testProject}_mysql_data"
    } finally {
        foreach ($name in $variables.Keys) { if ($null -eq $previous[$name]) { Remove-Item -LiteralPath ('Env:' + $name) -ErrorAction SilentlyContinue } else { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') } }
        Pop-Location
    }
}
