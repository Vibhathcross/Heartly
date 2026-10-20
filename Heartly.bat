@echo off
cd /d "%~dp0"
if exist "release-builds\Heartly-win32-x64\Heartly.exe" (
    start "" "release-builds\Heartly-win32-x64\Heartly.exe"
) else (
    start "" "node_modules\electron\dist\electron.exe" electron\main.cjs
)
