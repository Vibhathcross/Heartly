$WshShell = New-Object -ComObject WScript.Shell

$projectDir = "C:\Users\USER\OneDrive\Desktop\project HUB\Heartly"
$packagedExe = Join-Path $projectDir "release-builds\Heartly-win32-x64\Heartly.exe"
$icoPath = Join-Path $projectDir "public\heartly.ico"

$desktops = @(
    (Join-Path $env:USERPROFILE "OneDrive\Desktop"),
    (Join-Path $env:USERPROFILE "Desktop")
)

foreach ($desktop in $desktops) {
    if (Test-Path $desktop) {
        $shortcutPath = Join-Path $desktop "Heartly.lnk"
        $shortcut = $WshShell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $packagedExe
        $shortcut.WorkingDirectory = Split-Path $packagedExe -Parent
        $shortcut.IconLocation = "$icoPath,0"
        $shortcut.Description = "Heartly - Private Sanctuary for Two"
        $shortcut.Save()
        Write-Host "Created Standalone App shortcut at: $shortcutPath"

        $launcherPath = Join-Path $desktop "Heartly (Fast Launcher).lnk"
        $shortcut2 = $WshShell.CreateShortcut($launcherPath)
        $shortcut2.TargetPath = (Join-Path $projectDir "node_modules\electron\dist\electron.exe")
        $shortcut2.Arguments = "electron\main.cjs"
        $shortcut2.WorkingDirectory = $projectDir
        $shortcut2.IconLocation = "$icoPath,0"
        $shortcut2.Description = "Heartly - Private Sanctuary for Two"
        $shortcut2.Save()
        Write-Host "Created Fast Launcher shortcut at: $launcherPath"
    }
}
