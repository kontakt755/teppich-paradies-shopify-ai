#!/bin/bash
# Hook: Testsuiten vor jedem Push (CI-Audit 2026-11-07).
#
# Laesst alle Testsuiten laufen (npm run -s pruefen -- --nur tests, rund 25 s),
# bevor etwas zu GitHub geht. Ein roter Lauf blockiert den Push, die PR-
# Validierung sieht ihn dann gar nicht erst. Guards und Theme Check bleiben der
# CI, sie brauchen die Shopify CLI oder dauern laenger.
#
# Laeuft nicht:
#   - ohne node_modules in der Arbeitskopie (frischer Worktree): nur Hinweis
#   - bei TP_PUSH_OHNE_TESTS=1 (bewusst, z. B. Zwischenstand sichern)
#   - wenn nur geloescht wird (git push origin :branch)
# Installation je Rechner: .claude/hooks/SETUP.md.

[ "${TP_PUSH_OHNE_TESTS:-}" = "1" ] && exit 0

wurzel="$(git rev-parse --show-toplevel)"
cd "$wurzel" || exit 0

zeilen=0
nur_loeschen=1
while read -r lokal_ref lokal_sha entfernt_ref entfernt_sha; do
  zeilen=$((zeilen + 1))
  [ "$lokal_sha" != "0000000000000000000000000000000000000000" ] && nur_loeschen=0
done
[ "$zeilen" -gt 0 ] && [ "$nur_loeschen" = "1" ] && exit 0

if [ ! -d node_modules ]; then
  echo "pre-push: node_modules fehlt, Tests uebersprungen (npm ci; die CI prueft)." >&2
  exit 0
fi

echo "pre-push: Testsuiten laufen (TP_PUSH_OHNE_TESTS=1 ueberspringt) ..." >&2
if ! npm run -s pruefen -- --nur tests; then
  echo "pre-push: Tests rot - Push abgebrochen. Beheben oder bewusst mit TP_PUSH_OHNE_TESTS=1 pushen." >&2
  exit 1
fi
