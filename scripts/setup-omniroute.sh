#!/bin/bash
# OmniRoute — einmaliges lokales Setup
#
# Was das macht:
#   1. Fügt zwei Shell-Kurzbefehle zu deinem Profil hinzu:
#        omni-start   -> startet OmniRoute im Hintergrund (falls nicht schon läuft)
#        omni-codex   -> startet Codex CLI ueber OmniRoute (kostenlos, ohne eigenes API-Konto)
#   2. Claude Code bleibt bewusst UNVERAENDERT (native Anthropic-Verbindung),
#      damit die Arbeit an diesem Projekt zuverlaessig bleibt.
#
# Ausfuehren (einmalig, auf DEINEM Computer, nicht im Remote-Sandbox):
#   bash scripts/setup-omniroute.sh
#
# Danach neues Terminal oeffnen oder: source ~/.zshrc (bzw. ~/.bashrc)

set -e

# Shell-Profil erkennen
if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
    PROFILE="$HOME/.zshrc"
else
    PROFILE="$HOME/.bashrc"
fi

MARKER="# >>> omniroute shortcuts >>>"
END_MARKER="# <<< omniroute shortcuts <<<"

if grep -q "$MARKER" "$PROFILE" 2>/dev/null; then
    echo "✅ Shortcuts sind schon in $PROFILE eingetragen. Nichts zu tun."
    exit 0
fi

cat >> "$PROFILE" << 'EOF'

# >>> omniroute shortcuts >>>
# Startet OmniRoute im Hintergrund, falls es nicht schon laeuft.
omni-start() {
  if curl -s -o /dev/null -m 2 http://localhost:20128/health; then
    echo "OmniRoute laeuft bereits -> http://localhost:20128"
  else
    nohup npx -y omniroute > "$HOME/.omniroute.log" 2>&1 &
    disown
    echo "OmniRoute wird gestartet... (Log: ~/.omniroute.log)"
    echo "Dashboard in ein paar Sekunden hier: http://localhost:20128"
  fi
}

# Startet Codex CLI, geroutet ueber OmniRoute (kostenlose Modelle, kein eigener API-Key noetig).
# Claude Code bleibt bewusst unangetastet -> laeuft weiter direkt ueber Anthropic.
omni-codex() {
  omni-start > /dev/null
  npx -y omniroute run codex "$@"
}
# <<< omniroute shortcuts <<<
EOF

echo "✅ Fertig! Shortcuts wurden zu $PROFILE hinzugefuegt."
echo ""
echo "Naechster Schritt (einmalig):"
echo "  source $PROFILE"
echo ""
echo "Danach im Alltag nur noch:"
echo "  omni-start   -> OmniRoute im Hintergrund starten (Dashboard: http://localhost:20128)"
echo "  omni-codex   -> Codex CLI kostenlos ueber OmniRoute starten"
echo ""
echo "Claude Code bleibt unveraendert und laeuft weiter direkt ueber Anthropic."
