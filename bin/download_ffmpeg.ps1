<#
.SYNOPSIS
Downloads standalone static FFmpeg for Windows x64 into the jarvis-i5-assistant bin directory.
#>
$ErrorActionPreference = "Stop"
$destDir = "$PSScriptRoot"
$ffmpegExe = "$destDir\ffmpeg.exe"

if (Test-Path $ffmpegExe) {
    Write-Host "[OK] FFmpeg already exists at $ffmpegExe" -ForegroundColor Green
    exit 0
}

Write-Host "Downloading portable static FFmpeg (Windows x64)..." -ForegroundColor Cyan
$url = "https://github.com/GyanD/codexffmpeg/releases/download/7.1/ffmpeg-7.1-essentials_build.zip"
$zipPath = "$env:TEMP\ffmpeg_temp.zip"
$extractPath = "$env:TEMP\ffmpeg_extracted"

try {
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
    $found = Get-ChildItem -Path $extractPath -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
    if ($found) {
        Copy-Item -Path $found.FullName -Destination $ffmpegExe -Force
        Write-Host "[SUCCESS] FFmpeg installed to $ffmpegExe" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Could not find ffmpeg.exe inside archive." -ForegroundColor Yellow
    }
} catch {
    Write-Host "[WARN] Automatic download failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "You can also install ffmpeg via: winget install Gyan.FFmpeg" -ForegroundColor Cyan
} finally {
    Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $extractPath -Recurse -Force -ErrorAction SilentlyContinue
}
