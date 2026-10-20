# Heartly - Sync Updated Code to Installed Desktop App
# Updates the installed desktop application at AppData\Local\Programs\heartly

$ErrorActionPreference = "Stop"

$projectDir = "C:\Users\USER\OneDrive\Desktop\project HUB\Heartly"
$installedAppDir = "C:\Users\USER\AppData\Local\Programs\heartly"
$resourcesAppDir = Join-Path $installedAppDir "resources\app"
$resourcesEnv = Join-Path $installedAppDir "resources\.env"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Heartly - Desktop App Live Sync" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Cyan

if (-not (Test-Path $installedAppDir)) {
    Write-Host "Installed Heartly directory not found at: $installedAppDir" -ForegroundColor Yellow
    exit 1
}

# 1. Compile latest TypeScript
Write-Host "`n[1/5] Compiling latest TypeScript..." -ForegroundColor Cyan
Set-Location $projectDir
npm run build

# 2. Sync .env configuration
Write-Host "[2/5] Syncing .env configuration..." -ForegroundColor Cyan
Copy-Item (Join-Path $projectDir ".env") -Destination $resourcesEnv -Force
Copy-Item (Join-Path $projectDir ".env") -Destination (Join-Path $resourcesAppDir ".env") -Force

# 3. Sync dist (backend)
Write-Host "[3/5] Syncing compiled backend (dist)..." -ForegroundColor Cyan
Copy-Item (Join-Path $projectDir "dist\*") -Destination (Join-Path $resourcesAppDir "dist") -Recurse -Force

# 4. Sync public (frontend UI)
Write-Host "[4/5] Syncing frontend UI (public)..." -ForegroundColor Cyan
Copy-Item (Join-Path $projectDir "public\*") -Destination (Join-Path $resourcesAppDir "public") -Recurse -Force

# 5. Sync electron & package.json
Write-Host "[5/5] Syncing electron scripts and config..." -ForegroundColor Cyan
Copy-Item (Join-Path $projectDir "electron\*") -Destination (Join-Path $resourcesAppDir "electron") -Recurse -Force
Copy-Item (Join-Path $projectDir "package.json") -Destination (Join-Path $resourcesAppDir "package.json") -Force

# 6. Sync electron-updater modules to installed app
$updaterModules = @(
    'electron-updater',
    'builder-util-runtime',
    'lazy-val',
    'tiny-typed-emitter',
    'js-yaml',
    'lodash.escaperegexp',
    'lodash.isequal',
    'semver',
    'fs-extra',
    'graceful-fs',
    'jsonfile',
    'universalify',
    'argparse'
)
$destModules = Join-Path $resourcesAppDir "node_modules"
if (Test-Path $destModules) {
    foreach ($mod in $updaterModules) {
        $srcMod = Join-Path $projectDir "node_modules\$mod"
        $dstMod = Join-Path $destModules $mod
        if (Test-Path $srcMod) {
            Copy-Item $srcMod -Destination $dstMod -Recurse -Force
        }
    }
}

Write-Host "`nSUCCESS: Desktop App has been updated to the latest version with Ema!" -ForegroundColor Green
Write-Host "NOTE: If Heartly is currently open, quit it completely (right-click the Heartly tray icon or close window) and open it from the desktop shortcut to see Ema!" -ForegroundColor Yellow
