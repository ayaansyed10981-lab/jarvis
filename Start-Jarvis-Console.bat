@echo off
title JARVIS AI - 24/7 Intel Core i5 Console
cd /d "%~dp0"
echo ============================================================
echo   JARVIS AI - 24/7 Intel Core i5 Assistant
echo ============================================================
echo Starting Jarvis in Interactive Console Mode...
echo Wake word: "Jarvis" or "Hey Jarvis"
echo HUD Web URL: http://localhost:5050
echo Press Ctrl+C to stop.
echo ============================================================
node.exe src/index.js
pause
