#!/bin/bash
# SessionStart-Hook: macht eine frische Remote-Session arbeitsfaehig und zeigt
# den Projektzustand, statt ihn jede Sitzung neu herleiten zu lassen.
set -euo pipefail

# Lokal laeuft die Umgebung ohnehin; der Hook ist fuer Claude Code on the web.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# npm install statt ci: der Containerzustand wird nach dem Hook zwischen-
# gespeichert, und install nutzt einen vorhandenen node_modules-Stand.
if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi

echo ""
echo "── Projektzustand ──────────────────────────────────────────"

# Die drei Guards fangen genau die Fehler ab, die hier mehrfach bis in den
# Shop gelangt sind. Der Hook meldet nur die Zusammenfassungszeile.
for guard in liquid schema template; do
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
echo "  Storefront ist aus Remote-Sessions per Egress-Policy gesperrt:"
echo "  Browser-Schritte schlagen fehl, daher 'validate --static' nutzen."
echo "────────────────────────────────────────────────────────────"
