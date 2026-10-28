# Shares the running app with friends through Tailscale Serve: HTTPS inside your tailnet only.
# Never uses Funnel (that would publish the app to the whole internet). Changes only backend\.env and the
# Tailscale Serve config of this machine; undo everything with unshare.cmd.
#   share.cmd                                  - share, keep the current allowlist
#   share.cmd -Allow 7656119...,7656119...     - share and allow only these SteamID64 / FACEIT nicknames
param([string[]]$Allow = @(), [int]$Port = 0)
. (Join-Path $PSScriptRoot 'common.ps1')

if ($Port -eq 0) { $Port = Get-Port }
$ts = Get-Command tailscale -ErrorAction SilentlyContinue
if ($ts) { $ts = $ts.Source } else { $ts = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe' }
if (-not (Test-Path $ts)) { throw 'Tailscale is not installed. Get it from https://tailscale.com/download and sign in, then run share.cmd again.' }

$status = (& $ts status --json) | Out-String | ConvertFrom-Json
if ($status.BackendState -ne 'Running') { throw "Tailscale is not connected (state: $($status.BackendState)). Open Tailscale, sign in, then run share.cmd again." }
$dns = "$($status.Self.DNSName)".TrimEnd('.')
if (-not $dns) { throw 'This machine has no Tailscale DNS name. Enable MagicDNS: https://login.tailscale.com/admin/dns' }
$url = "https://$dns"

Invoke-Native "Tailscale Serve: $url -> 127.0.0.1:$Port" { & $ts serve --bg $Port }

Set-EnvValue 'APP_BASE_URL' $url
if ($Allow.Count -gt 0) { Set-EnvValue 'BETA_ALLOWLIST' (($Allow | ForEach-Object { $_.Trim() } | Where-Object { $_ }) -join ',') }
$allowlist = Get-EnvValue 'BETA_ALLOWLIST'

# APP_BASE_URL is read at start: restart so sign-in returns to the shared address
& (Join-Path $PSScriptRoot 'stop.ps1')
& (Join-Path $PSScriptRoot 'start.ps1') -Port $Port -NoBrowser
if ($LASTEXITCODE) { exit $LASTEXITCODE }

Write-Host ''
Write-Host "Shared inside your tailnet: $url" -ForegroundColor Green
if ($allowlist) { Write-Host "Sign-in allowed for: $allowlist" }
else { Write-Host 'No BETA_ALLOWLIST: anyone who can reach this address may sign in (only people you share the machine with can).' -ForegroundColor Yellow }
Write-Host ''
Write-Host 'Next:'
Write-Host "  1. Open $url here and sign in with Steam (this check is the first real Steam sign-in)."
Write-Host '  2. Tailscale admin -> Machines -> this PC -> Share... -> send the invite link to your friend.'
Write-Host '     He installs Tailscale, accepts the invite and opens the same address.'
Write-Host '  3. Stop sharing any time: unshare.cmd'
Start-Process $url
Start-Process 'https://login.tailscale.com/admin/machines'
