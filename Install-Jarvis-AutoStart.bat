@echo off
title Install Jarvis 24/7 AutoStart on Windows Boot
cd /d "%~dp0"
echo ============================================================
echo   Installing Jarvis 24/7 Auto-Start (Intel Core i5)
echo ============================================================

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET_VBS=%~dp0Start-Jarvis-Background.vbs"
set "LINK_NAME=%STARTUP_DIR%\Jarvis-AI-AutoStart.vbs"

echo Creating 24/7 auto-start runner in Windows Startup...
echo Set WshShell = CreateObject("WScript.Shell") > "%LINK_NAME%"
echo WshShell.Run "cscript.exe //nologo """ ^& "%TARGET_VBS%" ^& """", 0, False >> "%LINK_NAME%"

if exist "%LINK_NAME%" (
    echo.
    echo [SUCCESS] Jarvis is now configured to start automatically 24/7 when your PC turns on!
    echo Location: %LINK_NAME%
) else (
    echo.
    echo [ERROR] Failed to write to Startup directory.
)

echo.
pause
