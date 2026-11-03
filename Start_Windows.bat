@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Please install Node.js from https://nodejs.org/ and re-run.
 pause
 exit /b 1
)
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8787/'"
echo Starting Veilwards co-op server. Close this window to stop the server.
node server.js
pause
