# Shared paths and helpers for the Windows launcher. ASCII only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$EnvFile = Join-Path $Backend '.env'
$Python = Join-Path $Backend '.venv\Scripts\python.exe'
# Runtime data lives outside the repository so git pull / rebuilds / re-clones never touch it.
$AppHome = Join-Path $env:LOCALAPPDATA 'FaceitIntelligence'
$LogDir = Join-Path $AppHome 'logs'
$PidFile = Join-Path $AppHome 'server.pid'
$PortFile = Join-Path $AppHome 'server.port'

function Get-EnvValue([string]$Name) {
    # Value of NAME=... from backend\.env (uncommented lines only), or $null.
    if (-not (Test-Path $EnvFile)) { return $null }
    foreach ($line in Get-Content $EnvFile) {
        if ($line -match "^\s*$Name\s*=\s*(.*?)\s*$") { return $Matches[1].Trim('"', "'") }
    }
    return $null
}

function Get-DataDir {
    $configured = Get-EnvValue 'DATA_DIR'
    if ($configured) { return $configured }
    return (Join-Path $AppHome 'data')
}

function Get-ServerProcess {
    # The running app process recorded in the pid file, verified by its command line (PIDs get reused).
    if (-not (Test-Path $PidFile)) { return $null }
    $id = (Get-Content $PidFile -Raw).Trim()
    if (-not $id) { return $null }
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
    if ($proc -and $proc.CommandLine -like '*uvicorn*app.main:app*') { return $proc }
    return $null
}

function Get-Port {
    if (Test-Path $PortFile) { return [int](Get-Content $PortFile -Raw).Trim() }
    return 8000
}

function Get-Health([int]$Port) {
    try { return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3 } catch { return $null }
}

function Invoke-Native([string]$What, [scriptblock]$Command) {
    Write-Host "==> $What" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)" }
}

function Test-FrontendStale {
    # True when the built UI is missing or older than any frontend source file.
    $index = Join-Path $Frontend 'dist\index.html'
    if (-not (Test-Path $index)) { return $true }
    $built = (Get-Item $index).LastWriteTimeUtc
    $sources = @(Get-ChildItem (Join-Path $Frontend 'src') -Recurse -File) +
        @(Get-ChildItem $Frontend -File | Where-Object { $_.Name -in 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts' })
    return [bool]($sources | Where-Object { $_.LastWriteTimeUtc -gt $built } | Select-Object -First 1)
}
