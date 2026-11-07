@echo off
REM Ouvre le widget "Mes taches" de Life Planner dans une petite fenetre.
REM Demarre le serveur local seulement s'il ne tourne pas deja.
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient('localhost',5173)).Close(); exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "Life Planner (serveur)" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
  timeout /t 2 /nobreak >nul
)
start "" msedge --app=http://localhost:5173/widget.html --window-size=360,600
