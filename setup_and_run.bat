@echo off
setlocal enabledelayedexpansion
title WW Mini Games - Automatic Installer
color 0A

cd /d "%~dp0"

echo ========================================================
echo        WW Mini Games - Automatic Installer
echo ========================================================
echo Working Directory: %CD%
echo.
echo This script will install or verify:
echo   - Node.js LTS
echo   - npm dependencies
echo   - Desktop shortcut
echo.
echo Press any key to continue or CTRL+C to cancel...
pause >nul

set "TEMP_DIR=%TEMP%\WWMiniGamesInstall"
if not exist "%TEMP_DIR%" mkdir "%TEMP_DIR%"

echo.
echo [1/2] Checking Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js not found. Downloading Node.js LTS...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.3/node-v20.18.3-x64.msi' -OutFile '%TEMP_DIR%\nodejs.msi'}"
    if not exist "%TEMP_DIR%\nodejs.msi" (
        echo [ERROR] Failed to download Node.js. Install it manually from https://nodejs.org/
        pause
        exit /b 1
    )
    echo Installing Node.js silently...
    msiexec /i "%TEMP_DIR%\nodejs.msi" /qn /norestart
    timeout /t 10 /nobreak >nul
    call :RefreshPath
)
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is still missing.
    pause
    exit /b 1
)
echo [OK] Node.js ready.

echo.
echo [2/2] Installing npm dependencies...
if not exist "package.json" (
    echo [ERROR] package.json not found. Run this script from the app folder.
    pause
    exit /b 1
)
if not exist "node_modules\electron" (
    call npm install
    if errorlevel 1 (
        echo npm install failed. Trying legacy peer dependency mode...
        call npm cache clean --force
        call npm install --legacy-peer-deps
        if errorlevel 1 (
            echo [ERROR] npm install failed.
            pause
            exit /b 1
        )
    )
)
echo [OK] npm dependencies ready.

echo.
echo Creating desktop shortcut...
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\WW Mini Games.lnk'); $s.TargetPath = '%SCRIPT_DIR%run.bat'; $s.WorkingDirectory = '%SCRIPT_DIR%'; if (Test-Path '%SCRIPT_DIR%icon.ico') { $s.IconLocation = '%SCRIPT_DIR%icon.ico' }; $s.Save()"

echo.
echo Cleaning temporary installer files...
rd /s /q "%TEMP_DIR%" >nul 2>&1

echo.
echo ========================================================
echo              Installation Complete
echo ========================================================
echo Launching WW Mini Games...
timeout /t 2 /nobreak >nul
start "" "%SCRIPT_DIR%run.bat"
exit /b 0

:RefreshPath
set "SysPath="
set "UserPath="
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SysPath=%%b"
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "UserPath=%%b"
if defined SysPath (
    if defined UserPath (
        set "PATH=!SysPath!;!UserPath!"
    ) else (
        set "PATH=!SysPath!"
    )
)
goto :eof
