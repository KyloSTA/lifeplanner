# Génère app\couple\index.html (Couple Life Organiser) à partir de app\index.html (Life Planner).
# Les deux apps partagent le même code (css/, js/) ; la page couple ne change que le nom, les chemins
# et définit window.LP_APP (base de données, fichiers de synchro et réglages locaux séparés).
# À relancer après chaque changement de app\index.html (Publier.bat le fait automatiquement).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'app\index.html'
$dst = Join-Path $root 'app\couple\index.html'
$html = [IO.File]::ReadAllText($src, [Text.Encoding]::UTF8)

$config = @'
  <!-- Fichier généré par tools\make-couple.ps1 à partir de app\index.html : ne pas modifier ici. -->
  <script>
    // Couple Life Organiser : même code que Life Planner, avec sa propre base, ses propres fichiers de
    // synchro (cp-…) et ses propres réglages locaux, pour ne jamais se mêler à Life Planner (même site).
    window.LP_APP = { id: 'couplelife', name: 'Couple Life Organiser', db: 'couplelife', filePrefix: 'cp-', couple: true };
    (() => {
      const P = Storage.prototype, get = P.getItem, set = P.setItem, del = P.removeItem;
      const key = (k) => (typeof k === 'string' && k.startsWith('lp') ? 'couple:' + k : k);
      P.getItem = function (k) { return get.call(this, key(k)); };
      P.setItem = function (k, v) { return set.call(this, key(k), v); };
      P.removeItem = function (k) { return del.call(this, key(k)); };
    })();
  </script>
'@

$html = $html.Replace('<title>Life Planner</title>', '<title>Couple Life Organiser</title>')
$html = $html.Replace('href="css/styles.css"', 'href="../css/styles.css"')
$html = $html.Replace('src="js/app.js"', 'src="../js/app.js"')
# L'app couple garde son propre logo (coeurs) : icons\icon.svg de son dossier
$html = $html.Replace('href="icons/logo.png" type="image/png"', 'href="icons/icon.svg" type="image/svg+xml"')
$html = $html.Replace('class="logo-img round" src="icons/logo.png"', 'src="icons/icon.svg"')
$html = $html.Replace('src="icons/logo.png"', 'src="icons/icon.svg"')
$html = $html.Replace('  <link rel="manifest"', $config + "`n" + '  <link rel="manifest"')
if (-not $html.Contains("window.LP_APP")) { throw 'Balise manifest introuvable dans app\index.html' }

New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
[IO.File]::WriteAllText($dst, $html, (New-Object Text.UTF8Encoding $false))
Write-Host "app\couple\index.html genere."
