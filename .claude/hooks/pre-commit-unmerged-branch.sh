#!/bin/bash
# Hook: Verhindert Commits auf alten Feature-Branches, die nicht in main gemergt sind
# Ziel: Keine "verlorenen" Branches mit versteckten Änderungen
#
# Verglichen wird mit origin/main, nicht mit dem lokalen main: der lokale
# Branch main gehoert dem Deploy-Worktree und hinkt oft hinterher (16.10.: vier
# Commits). Gegen ihn galt ein laengst gemergter Branch als "nicht gemergt".
# Fehlt origin/main (kein Remote), dient das lokale main als Rueckfall.

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
MAIN_BRANCH="main"
MAIN_REF="origin/main"
git rev-parse --verify -q "$MAIN_REF" >/dev/null 2>&1 || MAIN_REF="$MAIN_BRANCH"

# Nur auf Non-Main-Branches prüfen (HEAD = losgeloest, z. B. Hauptcheckout)
if [[ "$CURRENT_BRANCH" == "$MAIN_BRANCH" || "$CURRENT_BRANCH" == "HEAD" ]]; then
  exit 0
fi

# Prüfe ob dieser Branch in main existiert
if git merge-base --is-ancestor "$CURRENT_BRANCH" "$MAIN_REF" 2>/dev/null; then
  # Branch ist bereits in main gemergt, alles OK
  exit 0
fi

# Branch ist NICHT in main. Prüfe wie alt er ist. %ct liefert den Unix-
# Zeitstempel direkt; frueher "date -j", das es nur auf macOS gibt (unter Linux
# ergab das ein Alter von ~20000 Tagen und blockierte jeden Branch).
LAST_COMMIT_TIMESTAMP=$(git log -1 --format=%ct "$CURRENT_BRANCH" 2>/dev/null)
[[ "$LAST_COMMIT_TIMESTAMP" =~ ^[0-9]+$ ]] || exit 0
NOW_TIMESTAMP=$(date +%s)
AGE_DAYS=$(( (NOW_TIMESTAMP - LAST_COMMIT_TIMESTAMP) / 86400 ))

# Warnung ab 7 Tagen, Error ab 30 Tagen
if [[ $AGE_DAYS -gt 30 ]]; then
  echo ""
  echo "⛔️  PRE-COMMIT BLOCK: Branch '$CURRENT_BRANCH' ist älter als 30 Tage UND nicht in $MAIN_REF gemergt!"
  echo ""
  echo "Letzter Commit: $AGE_DAYS Tage alt"
  echo ""
  echo "Das ist die Art von Branch, auf dem Änderungen 'verloren gehen'."
  echo ""
  echo "Optionen:"
  echo "  1. PR nach main eröffnen und mergen: gh pr create --base main"
  echo "  2. Änderungen auf main aufbauen: git fetch origin && git rebase origin/main"
  echo "  3. Wenn gelöscht werden soll: git branch -D $CURRENT_BRANCH"
  echo ""
  exit 1
elif [[ $AGE_DAYS -gt 7 ]]; then
  echo "⚠️  WARNUNG: Branch '$CURRENT_BRANCH' ist älter als 7 Tage und nicht in $MAIN_REF gemergt."
  echo "   Letzter Commit: $AGE_DAYS Tage alt"
  echo "   Überlegt, ob er wirklich weiter verfolgt werden soll?"
  echo ""
fi

exit 0
