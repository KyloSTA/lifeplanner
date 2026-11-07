@echo off
REM Ajoute (ou retire) le widget "Mes taches" au demarrage de Windows.
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Life Planner - Taches.lnk"
if exist "%LNK%" (
  del "%LNK%"
  echo Le widget ne s'ouvrira plus au demarrage de Windows.
) else (
  powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK); $s.TargetPath='%~dp0Widget Taches.bat'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.IconLocation='%SystemRoot%\System32\imageres.dll,76'; $s.Save()"
  echo Le widget s'ouvrira automatiquement au demarrage de Windows.
  echo Relance ce fichier pour l'annuler.
)
pause
