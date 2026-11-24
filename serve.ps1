# Petit serveur web local pour Life Planner (aucune installation requise).
# Google exige une origine http://localhost pour la connexion OAuth.
param([int]$Port = 5173)

$appDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'app')) + [IO.Path]::DirectorySeparatorChar
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json'; '.svg' = 'image/svg+xml'
  '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.md' = 'text/markdown; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
  Write-Host "Le port $Port est deja utilise (le serveur tourne peut-etre deja)."
  exit 1
}
Write-Host "Life Planner disponible sur http://localhost:$Port/  (Ctrl+C pour arreter)"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    $notesDir = Join-Path $appDir 'notes'
    if ($path -eq '/notes/' -and -not (Test-Path -LiteralPath (Join-Path $notesDir 'index.html'))) {
      # Liste des notes Markdown (en ligne, l'app la demande à l'API de GitHub)
      $names = @(Get-ChildItem -LiteralPath $notesDir -Filter *.md -File -ErrorAction SilentlyContinue | ForEach-Object { '"' + ($_.Name -replace '\\', '\\' -replace '"', '\"') + '"' })
      $res.ContentType = 'application/json; charset=utf-8'
      $res.Headers.Add('Cache-Control', 'no-cache')
      $bytes = [Text.Encoding]::UTF8.GetBytes('[' + ($names -join ',') + ']')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      continue
    }
    if ($path.EndsWith('/')) { $path += 'index.html' } # dossier -> sa page (ex. /couple/)
    $file = [IO.Path]::GetFullPath((Join-Path $appDir $path.TrimStart('/')))
    if (-not $file.StartsWith($appDir) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes('Introuvable')
    } else {
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-cache')
      $bytes = [IO.File]::ReadAllBytes($file)
    }
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
  } finally {
    $res.OutputStream.Close()
  }
}
