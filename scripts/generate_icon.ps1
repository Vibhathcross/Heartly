Add-Type -AssemblyName System.Drawing

$size = 128
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Draw rounded pink background tile
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 240, 243))
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 24
$rect = New-Object System.Drawing.Rectangle(4, 4, ($size - 8), ($size - 8))
$path.AddArc($rect.X, $rect.Y, $r, $r, 180, 90)
$path.AddArc($rect.Right - $r, $rect.Y, $r, $r, 270, 90)
$path.AddArc($rect.Right - $r, $rect.Bottom - $r, $r, $r, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $r, $r, $r, 90, 90)
$path.CloseFigure()
$g.FillPath($bgBrush, $path)

# Draw Heart Shape
$heartPath = New-Object System.Drawing.Drawing2D.GraphicsPath
# Left lobe
$heartPath.AddBezier(64, 40, 56, 20, 30, 20, 24, 42)
$heartPath.AddBezier(24, 42, 20, 56, 36, 76, 64, 102)
# Right lobe
$heartPath.AddBezier(64, 102, 92, 76, 108, 56, 104, 42)
$heartPath.AddBezier(104, 42, 98, 20, 72, 20, 64, 40)
$heartPath.CloseFigure()

# Heart gradient brush
$gradBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 20)),
    (New-Object System.Drawing.Point(0, 105)),
    [System.Drawing.Color]::FromArgb(255, 255, 77, 109),
    [System.Drawing.Color]::FromArgb(255, 255, 117, 140)
)
$g.FillPath($gradBrush, $heartPath)

$destDir = "$PSScriptRoot\..\public"
if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir | Out-Null }
$icoPath = "$destDir\heartly.ico"

# Save as Icon
$iconHandle = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$fileStream = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
$icon.Save($fileStream)
$fileStream.Close()
$icon.Dispose()
$g.Dispose()
$bmp.Dispose()

Write-Host "Generated Heartly icon at: $icoPath"
