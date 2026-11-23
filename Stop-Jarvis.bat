@echo off
title Stop Jarvis AI Assistant
cd /d "%~dp0"
echo Stopping Jarvis AI Assistant...
node.exe bin/stop.js
echo Done.
timeout /t 2 >nul
