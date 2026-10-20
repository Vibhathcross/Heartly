$desktopPath = [Environment]::GetFolderPath("Desktop")
$projectDir = "C:\Users\USER\OneDrive\Desktop\project HUB\Heartly"
$icoPath = "$projectDir\public\heartly.ico"
$vbsPath = "$projectDir\launch.vbs"

$WshShell = New-Object -ComObject WScript.Shell

# 1. Create on Desktop
$shortcut = $WshShell.CreateShortcut("$desktopPath\Heartly.lnk")
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $projectDir
$shortcut.IconLocation = "$icoPath, 0"
$shortcut.Description = "Heartly - Private Sanctuary for Two"
$shortcut.Save()

# 2. Create in Project Directory
$folderShortcut = $WshShell.CreateShortcut("$projectDir\Heartly.lnk")
$folderShortcut.TargetPath = "wscript.exe"
$folderShortcut.Arguments = "`"$vbsPath`""
$folderShortcut.WorkingDirectory = $projectDir
$folderShortcut.IconLocation = "$icoPath, 0"
$folderShortcut.Description = "Heartly - Private Sanctuary for Two"
$folderShortcut.Save()

Write-Host "Created Heartly desktop shortcut at: $desktopPath\Heartly.lnk"
Write-Host "Created Heartly folder shortcut at: $projectDir\Heartly.lnk"
