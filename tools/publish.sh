#!/usr/bin/env bash
# Publication rapide : copie le dossier app/ dans la copie locale de gh-pages (../lifeplanner-pages),
# crée une version et l'envoie. Quelques secondes, peu importe la longueur de l'historique
# (git subtree split recalculait tout l'historique : ~2 min, deux fois).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGES="$ROOT/../lifeplanner-pages"
cd "$ROOT"
git push -q origin main
# Copie locale du site : créée une fois si elle n'existe pas
if [ ! -e "$PAGES/.git" ]; then
  git fetch -q origin gh-pages
  git worktree add -q -B gh-pages "$PAGES" origin/gh-pages
fi
SHA="$(git rev-parse --short HEAD)"
MSG="$(git log -1 --format=%s)"
cd "$PAGES"
git fetch -q origin gh-pages
git reset -q --hard origin/gh-pages            # repart de ce qui est en ligne
git rm -rq --cached . >/dev/null 2>&1 || true   # vide l'index…
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +   # …et les fichiers (sauf .git)
git -C "$ROOT" archive HEAD:app | tar -x -f -   # exactement ce qui est commité (aucun fichier local en trop)
git add -A
if git diff --cached --quiet; then echo "Rien de nouveau à publier"; else git commit -q -m "Publish $SHA: $MSG"; git push -q origin gh-pages; fi
# Vérification : le site en ligne contient exactement le dossier app/ de main
git fetch -q origin gh-pages
[ "$(git -C "$ROOT" rev-parse main:app)" = "$(git rev-parse origin/gh-pages^{tree})" ] && echo PUBLISHED-OK || { echo "ÉCART entre app/ et gh-pages"; exit 1; }
