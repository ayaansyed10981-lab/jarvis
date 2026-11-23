@echo off
title Jarvis FFmpeg Downloader (Windows x64)
echo ========================================================
echo   JARVIS AI - Portable FFmpeg Installer (Intel x64)
echo ========================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0download_ffmpeg.ps1"
pause
