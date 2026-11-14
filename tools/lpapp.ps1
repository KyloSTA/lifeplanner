# Ouvre une application Windows par son nom dans le menu Démarrer (ex. « NHL »), à partir d'un lien
# « lpapp:NHL » cliqué dans le Lanceur de Life Planner. Fonctionne pour les apps installées depuis Edge
# (sites installés comme application) et pour les apps du Microsoft Store.
# Sécurité : n'ouvre qu'une app du menu Démarrer, sans arguments ; le nom est vérifié.
param([string]$Url = '')

$name = [uri]::UnescapeDataString(($Url -replace '^lpapp:(//)?', '')).Trim().TrimEnd('/')
if ($name -notmatch "^[\p{L}\p{N} ._&'+()-]{1,60}$") { exit 1 }

$apps = Get-StartApps
$app = $apps | Where-Object { $_.Name -eq $name } | Select-Object -First 1
if (-not $app) { $app = $apps | Where-Object { $_.Name -like "*$name*" } | Select-Object -First 1 }
if (-not $app) { exit 2 }
# Programme classique (AppID = chemin d'un .exe) : on le lance directement ; sinon app du Store ou installée depuis Edge
if ($app.AppID -match '^[A-Za-z]:\\.+\.exe$' -and (Test-Path $app.AppID)) { Start-Process -FilePath $app.AppID }
else { Start-Process "shell:AppsFolder\$($app.AppID)" }
