# Starts the app in the background on this computer only (127.0.0.1) and opens the browser.
param([int]$Port = 8000, [switch]$NoBrowser)
. (Join-Path $PSScriptRoot 'common.ps1')

$url = "http://localhost:$Port"
if (Get-ServerProcess) {
    $running = Get-AppUrl (Get-Port)
    Write-Host "Already running: $running"
    if (-not $NoBrowser) { Start-Process $running }
    exit 0
}
if (-not (Test-Path $Python)) { throw 'Dependencies are not installed. Run setup.cmd first.' }
if (-not (Test-Path $EnvFile)) { throw 'backend\.env is missing. Run setup.cmd first.' }
$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) { throw "Port $Port is already used by another program. Use: start.cmd -Port 8001 (and set APP_BASE_URL accordingly)." }

if (Test-FrontendStale) {
    Push-Location $Frontend
    try { Invoke-Native 'Interface changed - rebuilding (npm run build)' { npm run build } } finally { Pop-Location }
}

$data = Get-DataDir
New-Item -ItemType Directory -Force -Path $data, $LogDir | Out-Null
if (-not (Get-EnvValue 'DATA_DIR')) { $env:DATA_DIR = $data }
$base = Get-EnvValue 'APP_BASE_URL'
if (-not $base) { $env:APP_BASE_URL = $url }
elseif ($base -like 'http://*' -and $base -ne $url) { Write-Host "Note: APP_BASE_URL in .env is $base - open the app at that address." -ForegroundColor Yellow }

$out = Join-Path $LogDir 'server.out.log'
$err = Join-Path $LogDir 'server.log'
foreach ($f in $out, $err) { if (Test-Path $f) { Move-Item $f "$f.prev" -Force } }

# Bound to 127.0.0.1: not reachable from the local network or the internet.
$proc = Start-Process -FilePath $Python -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$Port" `
    -WorkingDirectory $Backend -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
Set-Content $PidFile $proc.Id
Set-Content $PortFile $Port

Write-Host -NoNewline 'Starting'
for ($i = 0; $i -lt 90; $i++) {
    if ($proc.HasExited) { break }
    if (Get-Health $Port) { break }
    Write-Host -NoNewline '.'
    Start-Sleep -Seconds 1
}
Write-Host ''
$health = Get-Health $Port
if (-not $health) {
    Write-Host 'The app did not start. Last log lines:' -ForegroundColor Red
    if (Test-Path $err) { Get-Content $err -Tail 25 }
    if (-not $proc.HasExited) { & taskkill /PID $proc.Id /T /F | Out-Null }
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    exit 1
}
$url = Get-AppUrl $Port
Write-Host "FACEIT Intelligence is running: $url" -ForegroundColor Green
if (-not $health.api_key_configured) { Write-Host "FACEIT_API_KEY is not set in $EnvFile - player data will not load." -ForegroundColor Yellow }
Write-Host "Data: $data    Logs: $LogDir    Stop: stop.cmd"
if (-not $NoBrowser) { Start-Process $url }
