#!/bin/bash
# Hook: Verhindert Commits auf alten Feature-Branches, die nicht in main gemergt sind
# Ziel: Keine "verlorenen" Branches mit versteckten Änderungen

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
MAIN_BRANCH="main"

# Nur auf Non-Main-Branches prüfen
if [[ "$CURRENT_BRANCH" == "$MAIN_BRANCH" ]]; then
  exit 0
fi

# Prüfe ob dieser Branch in main existiert
if git merge-base --is-ancestor "$CURRENT_BRANCH" "$MAIN_BRANCH" 2>/dev/null; then
  # Branch ist bereits in main gemergt, alles OK
  exit 0
fi

# Branch ist NICHT in main. Prüfe wie alt er ist
LAST_COMMIT_DATE=$(git log -1 --format=%ci "$CURRENT_BRANCH" 2>/dev/null | cut -d' ' -f1)
LAST_COMMIT_TIMESTAMP=$(date -j -f "%Y-%m-%d" "$LAST_COMMIT_DATE" +%s 2>/dev/null)
NOW_TIMESTAMP=$(date +%s)
AGE_DAYS=$(( (NOW_TIMESTAMP - LAST_COMMIT_TIMESTAMP) / 86400 ))

# Warnung ab 7 Tagen, Error ab 30 Tagen
if [[ $AGE_DAYS -gt 30 ]]; then
  echo ""
  echo "⛔️  PRE-COMMIT BLOCK: Branch '$CURRENT_BRANCH' ist älter als 30 Tage UND nicht in main gemergt!"
  echo ""
  echo "Letzter Commit: $AGE_DAYS Tage alt"
  echo ""
  echo "Das ist die Art von Branch, auf dem Änderungen 'verloren gehen'."
  echo ""
  echo "Optionen:"
  echo "  1. Branch in main mergen: git checkout main && git pull && git merge $CURRENT_BRANCH"
  echo "  2. Änderungen auf main aufbauen: git rebase main"
  echo "  3. Wenn gelöscht werden soll: git branch -D $CURRENT_BRANCH"
  echo ""
  exit 1
elif [[ $AGE_DAYS -gt 7 ]]; then
  echo "⚠️  WARNUNG: Branch '$CURRENT_BRANCH' ist älter als 7 Tage und nicht in main gemergt."
  echo "   Letzter Commit: $AGE_DAYS Tage alt"
  echo "   Überlegt, ob er wirklich weiter verfolgt werden soll?"
  echo ""
fi

exit 0
