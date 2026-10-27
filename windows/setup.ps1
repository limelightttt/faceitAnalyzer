# One-time setup (re-run after git pull): dependencies, UI build, backend\.env, data folder.
# Changes nothing outside this folder and %LOCALAPPDATA%\FaceitIntelligence. No autostart, no firewall/network changes.
. (Join-Path $PSScriptRoot 'common.ps1')

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host 'uv (Python package manager) is not installed.' -ForegroundColor Yellow
    $answer = Read-Host 'Install uv now with the official installer from astral.sh (user-level, no admin)? [y/N]'
    if ($answer -notmatch '^[yY]') { throw 'Install uv: https://docs.astral.sh/uv/getting-started/installation/ then run setup.cmd again.' }
    powershell -NoProfile -ExecutionPolicy Bypass -Command 'irm https://astral.sh/uv/install.ps1 | iex'
    $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw 'uv installed but not found on PATH. Open a new terminal and run setup.cmd again.' }
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'Node.js is not installed. Install Node.js 20 LTS or newer (https://nodejs.org or: winget install OpenJS.NodeJS.LTS), open a new terminal and run setup.cmd again.'
}

if (Get-ServerProcess) { throw 'The app is running. Run stop.cmd first, then setup.cmd.' }

Push-Location $Backend
try { Invoke-Native 'Backend dependencies (uv sync)' { uv sync --frozen } } finally { Pop-Location }
Push-Location $Frontend
try {
    Invoke-Native 'Frontend dependencies (npm ci)' { npm ci --no-audit --no-fund }
    Invoke-Native 'Building the interface (npm run build)' { npm run build }
} finally { Pop-Location }

if (-not (Test-Path $EnvFile)) {
    Copy-Item (Join-Path $Backend '.env.example') $EnvFile
    Write-Host "Created $EnvFile from .env.example - open it and fill in FACEIT_API_KEY." -ForegroundColor Yellow
} else {
    Write-Host "Keeping existing $EnvFile"
}

$data = Get-DataDir
New-Item -ItemType Directory -Force -Path $data, $LogDir | Out-Null
# Earlier versions kept data in backend\data. Copy it once (never delete, never overwrite).
$legacy = Join-Path $Backend 'data'
if ((Test-Path (Join-Path $legacy 'app.db')) -and -not (Test-Path (Join-Path $data 'app.db'))) {
    Copy-Item (Join-Path $legacy '*') $data -Recurse
    Write-Host "Copied existing data from $legacy to $data (the original is left in place)."
}

Write-Host ''
Write-Host "Setup complete. Data folder: $data" -ForegroundColor Green
if (-not (Get-EnvValue 'FACEIT_API_KEY')) { Write-Host "Remember to set FACEIT_API_KEY in $EnvFile" -ForegroundColor Yellow }
Write-Host 'Start the app with start.cmd'
