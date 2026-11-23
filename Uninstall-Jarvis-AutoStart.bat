@echo off
title Uninstall Jarvis 24/7 AutoStart
echo Removing Jarvis from Windows Startup...
set "LINK_NAME=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Jarvis-AI-AutoStart.vbs"

if exist "%LINK_NAME%" (
    del /f /q "%LINK_NAME%"
    echo [SUCCESS] Auto-start runner removed successfully.
) else (
    echo [INFO] Auto-start runner was not found in Startup.
)

pause
