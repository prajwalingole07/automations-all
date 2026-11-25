@echo off
setlocal EnableExtensions EnableDelayedExpansion
title NEXUS Automation Hub - Direct Launcher (Render Cloud)
color 0B
cd /d "%~dp0"

echo ==============================================================================
echo                 NEXUS AUTOMATION HUB - RENDER CLOUD LAUNCHER                   
echo ==============================================================================
echo  Machine:   %COMPUTERNAME%
echo  System:    Windows 64-bit
echo ==============================================================================
echo.

set "TARGET_URL=https://ameautomations.onrender.com"
if exist "cloud_url.txt" (
    set /p FILE_URL=<cloud_url.txt
    if defined FILE_URL (
        set "TARGET_URL=!FILE_URL!"
    )
)

echo [1/3] Target Cloud Hub: %TARGET_URL%

:: 1. Launch Chrome / Default Browser directly to Render Dashboard in a new tab
echo [2/3] Launching Render Dashboard in Chrome...
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "%TARGET_URL%/dashboard"
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" "%TARGET_URL%/dashboard"
) else (
    start "" "%TARGET_URL%/dashboard"
)

:: 2. Start Local Windows Runner Agent directly
echo.
echo ==============================================================================
echo [RUNNER ACTIVE] Connecting %COMPUTERNAME% to %TARGET_URL%...
echo [MONITORING]    Heartbeat active. Ready to execute automations in new tabs.
echo Leave this window open while automations run. Press Ctrl+C to terminate.
echo ==============================================================================
echo.

set "RUNNER_DIR=%~dp0runner"
if not exist "%RUNNER_DIR%" set "RUNNER_DIR=%~dp0automation-hub\runner"

if exist "%RUNNER_DIR%\runner.js" (
    cd /d "%RUNNER_DIR%"
    set "CLOUD_URL=%TARGET_URL%"
    set "MACHINE_NAME=%COMPUTERNAME%"
    set "RUNNER_SECRET_TOKEN=local-dev-runner"
    node runner.js
) else (
    echo [RUNNER NOTICE] runner.js not found in current directory.
    echo Dashboard opened in your browser. Automations can be run from the web interface.
)

pause
