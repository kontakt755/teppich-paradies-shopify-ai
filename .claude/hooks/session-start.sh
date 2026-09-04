#!/bin/bash
# SessionStart-Hook: macht eine frische Remote-Session arbeitsfaehig und zeigt
# den Projektzustand, statt ihn jede Sitzung neu herleiten zu lassen.
set -euo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# Laeuft IMMER, auch lokal: am 2026-09-04 lag ein Checkout unter iCloud-
# synchronisiertem ~/Documents, was Git-Sperren mit der Cloud-Synchronisation
# kollidieren liess (minutenlange Haenger, am Ende eine beschaedigte
# Git-Objektdatenbank). Warnt frueh, bevor irgendein Git-Befehl laeuft.
if ! node qa/run-sync-path-guard.mjs; then
  echo ""
  echo "  Diese Sitzung arbeitet trotzdem weiter, aber Git-Befehle koennen"
  echo "  haengen oder die Objektdatenbank beschaedigen. Checkout verschieben,"
  echo "  sobald moeglich."
  echo ""
fi

# Lokal laeuft die Umgebung ohnehin; der Rest des Hooks ist fuer Claude Code on the web.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# npm install statt ci: der Containerzustand wird nach dem Hook zwischen-
# gespeichert, und install nutzt einen vorhandenen node_modules-Stand.
if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi

echo ""
echo "── Projektzustand ──────────────────────────────────────────"

# Die drei Guards fangen genau die Fehler ab, die hier mehrfach bis in den
# Shop gelangt sind. Der Hook meldet nur die Zusammenfassungszeile.
for guard in liquid schema template live-theme; do
  if out=$(node "qa/run-${guard}-guard.mjs" 2>&1); then
    echo "  ${out##*$'\n'}"
  else
    echo "  FEHLER im ${guard}-guard:"
    echo "$out" | sed 's/^/    /'
  fi
done

# Blockdrift ueber die Kollektions-Templates - die haeufigste stille Ursache
# dafuer, dass Kategorieseiten unterschiedlich aussehen.
echo ""
echo "  Produktkarten-Bloecke je Template:"
node automation/scripts/theme-block.mjs list 2>/dev/null | sed 's/^/    /' || true

echo ""
echo "  Router-Klassifizierung (Fehler-Datenbank):"
node automation/scripts/session-start-router.mjs 2>/dev/null | sed 's/^/    /' || true

echo ""
echo "  Remote-Session Fehler-Check:"
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  node automation/scripts/create-remote-session-issue.mjs 2>/dev/null | sed 's/^/    /' || true

  echo ""
  echo "  ⚠️  WARNUNG:"
  echo "  Storefront (teppich-paradies.net) ist aus Remote-Sessions per Egress-Policy gesperrt."
  echo "  jordanshop.de Import braucht Browser-Zugriff — funktioniert nur lokal."
  echo "  Browser-Schritte nutze '--static' flag, oder arbeite lokal mit npm run."
else
  echo "  ✓ Lokale Session erkannt — jordanshop.de Import funktioniert"
fi
echo "────────────────────────────────────────────────────────────"
