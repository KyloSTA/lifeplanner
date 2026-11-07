@echo off
REM Envoie la derniere version de Life Planner sur GitHub : elle est en ligne 1 a 2 minutes plus tard.
REM - branche main : tout le projet ; branche gh-pages : seulement le dossier app\ (le site publie)
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\Git\cmd"
where git >nul 2>nul || (echo Git n'est pas installe. & pause & exit /b 1)
git add -A
git commit -m "Mise a jour de Life Planner" >nul 2>nul
git push origin main
if errorlevel 1 goto :erreur
git subtree push --prefix app origin gh-pages
if errorlevel 1 goto :erreur
echo.
echo Envoye ! La nouvelle version sera en ligne dans 1 a 2 minutes.
pause
exit /b 0
:erreur
echo.
echo L'envoi a echoue : verifie ta connexion internet et GitHub.
pause
exit /b 1
