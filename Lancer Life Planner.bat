@echo off
REM Demarre le serveur local puis ouvre Life Planner dans Edge.
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient('localhost',5173)).Close(); exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "Life Planner (serveur)" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
  timeout /t 2 /nobreak >nul
)
start "" msedge "http://localhost:5173/"
