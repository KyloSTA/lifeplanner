@echo off
REM Une seule fois : permet au Lanceur de Life Planner d'ouvrir directement tes applications Windows
REM (ex. NHL installee depuis Edge), sans passer par une page web.
REM Ajoute le lien « lpapp: » pour ton compte Windows seulement (HKCU), aucun droit administrateur.
REM Pour l'enlever : reg delete "HKCU\Software\Classes\lpapp" /f
set "VBS=%~dp0tools\lpapp.vbs"
reg add "HKCU\Software\Classes\lpapp" /ve /d "URL:Life Planner - applications" /f >nul
reg add "HKCU\Software\Classes\lpapp" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\lpapp\shell\open\command" /ve /d "wscript.exe \"%VBS%\" \"%%1\"" /f >nul
echo.
echo  Lien lpapp: installe. Dans le Lanceur, choisis le mode "App Windows" pour une tuile
echo  (son nom doit etre celui de l'app dans le menu Demarrer, ex. NHL).
echo  La premiere fois, Edge demande "Ouvrir ?" : coche "Toujours autoriser".
echo.
pause
