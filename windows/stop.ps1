# Stops the app started by start.cmd (and its demo-parser worker processes).
. (Join-Path $PSScriptRoot 'common.ps1')

$proc = Get-ServerProcess
if (-not $proc) {
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    Write-Host 'The app is not running.'
    exit 0
}
& taskkill /PID $proc.ProcessId /T /F | Out-Null
Remove-Item $PidFile -ErrorAction SilentlyContinue
# SQLite (WAL) is crash-safe; demo/scout jobs that were in progress are marked as interrupted on next start.
Write-Host 'Stopped.'
