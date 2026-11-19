# Logo de Life Planner : à partir de tools\logo-source.jpg, crée les icônes de l'app.
# - recadre serré autour de l'écusson rond (les marges sombres sont retirées) ;
# - fond transparent hors du cercle (visible sur le menu noir comme sur un fond clair) ;
# - couleurs plus vives : saturation, contraste et luminosité augmentés.
# Sorties : app\icons\logo.png (256), app\icons\icon-512.png, app\icons\icon-192.png
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $PSScriptRoot 'logo-source.jpg'
$img = [System.Drawing.Bitmap]::FromFile($src)
$W = $img.Width; $H = $img.Height

# 1. Où est l'écusson ? Les pixels nettement plus clairs que le fond sombre (échantillonnage tous les 4 px)
$minX = $W; $minY = $H; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $H; $y += 4) {
  for ($x = 0; $x -lt $W; $x += 4) {
    $p = $img.GetPixel($x, $y)
    if ([Math]::Max($p.R, [Math]::Max($p.G, $p.B)) -gt 95) {
      if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$cx = ($minX + $maxX) / 2; $cy = ($minY + $maxY) / 2
$side = [Math]::Max($maxX - $minX, $maxY - $minY) + 8
Write-Output ("Ecusson : x {0}-{1}, y {2}-{3}, cote {4}" -f $minX, $maxX, $minY, $maxY, $side)

function Make([int]$S, [string]$out) {
  # 2. Recadrage + couleurs vives (matrice de couleur : saturation 1,4, contraste 1,15, lumière +5 %)
  $crop = New-Object System.Drawing.Bitmap $S, $S
  $g = [System.Drawing.Graphics]::FromImage($crop)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  # (PowerShell ne distingue pas majuscules et minuscules : pas de $s ici, $S est la taille)
  $sat = 1.4; $c = 1.15; $b = 0.05
  $lr = 0.3086; $lg = 0.6094; $lb = 0.0820
  $sr = (1 - $sat) * $lr; $sg = (1 - $sat) * $lg; $sb = (1 - $sat) * $lb
  $t = 0.5 * (1 - $c) + $b
  $m = New-Object System.Drawing.Imaging.ColorMatrix
  $m.Matrix00 = ($sr + $sat) * $c; $m.Matrix01 = $sr * $c;          $m.Matrix02 = $sr * $c
  $m.Matrix10 = $sg * $c;          $m.Matrix11 = ($sg + $sat) * $c; $m.Matrix12 = $sg * $c
  $m.Matrix20 = $sb * $c;          $m.Matrix21 = $sb * $c;          $m.Matrix22 = ($sb + $sat) * $c
  $m.Matrix33 = 1
  $m.Matrix40 = $t; $m.Matrix41 = $t; $m.Matrix42 = $t; $m.Matrix44 = 1
  $attr = New-Object System.Drawing.Imaging.ImageAttributes
  $attr.SetColorMatrix($m)
  $srcRect = New-Object System.Drawing.Rectangle ([int]($cx - $side / 2)), ([int]($cy - $side / 2)), ([int]$side), ([int]$side)
  $dstRect = New-Object System.Drawing.Rectangle 0, 0, $S, $S
  $g.DrawImage($img, $dstRect, $srcRect.X, $srcRect.Y, $srcRect.Width, $srcRect.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr)
  $g.Dispose()

  # 3. Cercle sur fond transparent (bord lissé)
  $outBmp = New-Object System.Drawing.Bitmap $S, $S, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g2 = [System.Drawing.Graphics]::FromImage($outBmp)
  $g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g2.Clear([System.Drawing.Color]::Transparent)
  $brush = New-Object System.Drawing.TextureBrush $crop
  $g2.FillEllipse($brush, 0, 0, $S - 1, $S - 1)
  $g2.Dispose(); $brush.Dispose(); $crop.Dispose()
  $outBmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $outBmp.Dispose()
  Write-Output ("{0} : {1} Ko" -f (Split-Path $out -Leaf), [Math]::Round((Get-Item $out).Length / 1KB))
}

$icons = Join-Path $root 'app\icons'
Make 256 (Join-Path $icons 'logo.png') # menu et onglet : plus léger
Make 512 (Join-Path $icons 'icon-512.png')
Make 192 (Join-Path $icons 'icon-192.png')
$img.Dispose()
