# Stops sharing through Tailscale Serve and returns the app to localhost-only. The allowlist is kept.
param([int]$Port = 0)
. (Join-Path $PSScriptRoot 'common.ps1')

if ($Port -eq 0) { $Port = Get-Port }
$ts = Get-Command tailscale -ErrorAction SilentlyContinue
if ($ts) { $ts = $ts.Source } else { $ts = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe' }
if (Test-Path $ts) { Invoke-Native 'Tailscale Serve: off' { & $ts serve reset } }

Set-EnvValue 'APP_BASE_URL' "http://localhost:$Port"
& (Join-Path $PSScriptRoot 'stop.ps1')
& (Join-Path $PSScriptRoot 'start.ps1') -Port $Port -NoBrowser
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Write-Host "Sharing stopped. The app is available only on this computer: http://localhost:$Port" -ForegroundColor Green
