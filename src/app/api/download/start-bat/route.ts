import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cloudUrl = `${url.protocol}//${url.host}`;

  const batContent = `@echo off
setlocal EnableExtensions EnableDelayedExpansion
title NEXUS Automation Hub - Direct Launcher (Render Cloud)
color 0B
cd /d "%~dp0"

echo ==============================================================================
echo                 NEXUS AUTOMATION HUB - RENDER CLOUD LAUNCHER                   
echo ==============================================================================
echo  Target Hub:  ${cloudUrl}
echo  Machine:     %COMPUTERNAME%
echo  System:      Windows 64-bit
echo ==============================================================================
echo.

set "TARGET_URL=${cloudUrl}"

:: 1. Launch Chrome / Default Browser directly to Render Dashboard in a new tab/window
echo [1/2] Opening Render Dashboard in Chrome...
if exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" "%TARGET_URL%/dashboard"
) else if exist "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" "%TARGET_URL%/dashboard"
) else (
    start "" "%TARGET_URL%/dashboard"
)

:: 2. If local runner files exist in current folder or ../runner, start local runner agent
echo [2/2] Checking for local automation runner files...
set "RUNNER_SCRIPT="
if exist "runner\\runner.js" set "RUNNER_SCRIPT=runner\\runner.js"
if exist "runner.js" set "RUNNER_SCRIPT=runner.js"
if exist "..\\runner\\runner.js" set "RUNNER_SCRIPT=..\\runner\\runner.js"

if defined RUNNER_SCRIPT (
    echo.
    echo ==============================================================================
    echo [RUNNER ACTIVE] Connecting %COMPUTERNAME% to %TARGET_URL%...
    echo [MONITORING]    Automation jobs will execute locally and open in new tabs.
    echo Leave this window open while running automations. Press Ctrl+C to stop.
    echo ==============================================================================
    echo.
    set "CLOUD_URL=%TARGET_URL%"
    set "MACHINE_NAME=%COMPUTERNAME%"
    set "RUNNER_SECRET_TOKEN=local-dev-runner"
    node "%RUNNER_SCRIPT%"
) else (
    echo.
    echo Dashboard opened successfully!
    echo Automations can now be launched directly from the web dashboard in new tabs.
    echo.
    echo (To execute Playwright browser jobs directly on this PC, place this .bat in the
    echo  automation hub project directory containing the runner/ folder and re-run.)
)

pause
`;

  return new NextResponse(batContent, {
    headers: {
      'Content-Type': 'application/x-bat',
      'Content-Disposition': 'attachment; filename="START_AUTOMATION.bat"',
    },
  });
}
