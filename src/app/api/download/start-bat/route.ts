import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function resolvePublicCloudUrl(request: Request): string {
  // 1. Render provided external URL env var
  if (process.env.RENDER_EXTERNAL_URL && !process.env.RENDER_EXTERNAL_URL.includes('localhost') && !process.env.RENDER_EXTERNAL_URL.includes('10000')) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  }

  // 2. Read cloud_url.txt if present
  try {
    const txtPath = path.join(process.cwd(), 'cloud_url.txt');
    if (fs.existsSync(txtPath)) {
      const val = fs.readFileSync(txtPath, 'utf8').trim();
      if (val && !val.includes('localhost') && !val.includes('10000')) {
        return val.replace(/\/+$/, '');
      }
    }
  } catch {}

  // 3. Check reverse-proxy headers from Render
  const fHost = request.headers.get('x-forwarded-host');
  const fProto = request.headers.get('x-forwarded-proto') || 'https';
  if (fHost && !fHost.includes('localhost') && !fHost.includes('10000')) {
    return `${fProto}://${fHost}`.replace(/\/+$/, '');
  }

  const host = request.headers.get('host') || '';
  if (host && !host.includes('localhost') && !host.includes('10000')) {
    const proto = host.includes('render.com') ? 'https' : (request.url.startsWith('https') ? 'https' : 'http');
    return `${proto}://${host}`.replace(/\/+$/, '');
  }

  // 4. Default to the official public production domain
  return 'https://ameautomations.onrender.com';
}

export async function GET(request: Request) {
  const cloudUrl = resolvePublicCloudUrl(request);

  const batContent = `@echo off
setlocal EnableExtensions EnableDelayedExpansion
title NEXUS Automation Hub - Direct Launcher
color 0B
cd /d "%~dp0"

echo ==============================================================================
echo                 NEXUS AUTOMATION HUB - RENDER CLOUD LAUNCHER                   
echo ==============================================================================
echo  Machine:   %COMPUTERNAME%
echo  System:    Windows 64-bit
echo ==============================================================================
echo.

set "TARGET_URL=${cloudUrl}"
if exist "cloud_url.txt" (
    set /p FILE_URL=<cloud_url.txt
    if defined FILE_URL (
        set "TARGET_URL=!FILE_URL!"
    )
)

:: Safety sanitize: Never use internal container port 10000 or localhost:10000 on Windows PC
echo !TARGET_URL! | findstr /i "10000 localhost:10000 127.0.0.1:10000" >nul
if !errorlevel! equ 0 (
    set "TARGET_URL=https://ameautomations.onrender.com"
)

echo [1/2] Connecting to Cloud Hub: %TARGET_URL%

:: 1. Launch Chrome / Default Browser directly to Render Dashboard in a new tab
echo [2/2] Opening Render Dashboard in Chrome...
if exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" "%TARGET_URL%/dashboard"
) else if exist "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" "%TARGET_URL%/dashboard"
) else (
    start "" "%TARGET_URL%/dashboard"
)

:: 2. If local runner files exist in current folder or ../runner, start local runner agent
set "RUNNER_SCRIPT="
if exist "runner\\runner.js" set "RUNNER_SCRIPT=runner\\runner.js"
if exist "runner.js" set "RUNNER_SCRIPT=runner.js"
if exist "..\\runner\\runner.js" set "RUNNER_SCRIPT=..\\runner\\runner.js"

if defined RUNNER_SCRIPT (
    echo.
    echo ==============================================================================
    echo [RUNNER ACTIVE] Connecting %COMPUTERNAME% to %TARGET_URL%...
    echo [MONITORING]    Heartbeat active. Ready to execute automations.
    echo Leave this window open while automations run. Press Ctrl+C to terminate.
    echo ==============================================================================
    echo.
    set "CLOUD_URL=%TARGET_URL%"
    set "MACHINE_NAME=%COMPUTERNAME%"
    set "RUNNER_SECRET_TOKEN=local-dev-runner"
    node "%RUNNER_SCRIPT%"
) else (
    echo.
    echo [RUNNER NOTICE] runner.js not found in current directory.
    echo Dashboard opened in your browser: %TARGET_URL%/dashboard
    echo Automations can now be launched directly from the web dashboard.
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
