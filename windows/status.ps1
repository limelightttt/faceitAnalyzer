# Shows whether the app is running and its health (no secrets are printed).
. (Join-Path $PSScriptRoot 'common.ps1')

$proc = Get-ServerProcess
$port = Get-Port
Write-Host "Data folder: $(Get-DataDir)"
Write-Host "Logs:        $LogDir"
if (-not $proc) { Write-Host 'Status:      stopped'; exit 0 }
Write-Host "Status:      running (pid $($proc.ProcessId)) at http://localhost:$port"
$h = Get-Health $port
if (-not $h) { Write-Host 'Health:      not responding (see logs\server.log)' -ForegroundColor Yellow; exit 1 }
Write-Host "Health:      ok ($($h.demo_parser))"
Write-Host "FACEIT key:  $(if ($h.api_key_configured) { 'configured' } else { 'MISSING' })"
Write-Host "Login:       $(if ($h.require_login) { 'required' } else { 'not required' })$(if ($h.private_beta) { ', allowlist active' })"
if ($h.rate_limit -and $h.rate_limit.limited) { Write-Host "FACEIT rate limit: waiting until $($h.rate_limit.retry_at) (UTC)" -ForegroundColor Yellow }
