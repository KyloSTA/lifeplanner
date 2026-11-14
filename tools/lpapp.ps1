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
if ($app) { Start-Process "shell:AppsFolder\$($app.AppID)" } else { exit 2 }
