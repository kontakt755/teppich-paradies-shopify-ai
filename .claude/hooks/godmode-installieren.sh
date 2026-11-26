#!/bin/bash
# Aus session-start.sh, nur in Remote-Sessions: installiert das Plugin godmode
# (Arbeitsmodus, AGENTS.md). settings.json schaltet es nur ein; installiert wird
# es je Rechner einmal, und eine Cloud-Sitzung startet auf einem frischen Rechner.
# Haelt den Sitzungsstart nie auf: ein Fehler wird gemeldet, Exit bleibt 0.

# Die Installation startet selbst eine kurze Claude-Sitzung, deren
# SessionStart-Hook wieder hier landet - ohne diese Sperre eine Endlosschleife.
[ -n "${TP_GODMODE_INSTALL:-}" ] && exit 0
[ -d "$HOME/.claude/plugins/cache/godmode" ] && exit 0
command -v claude >/dev/null 2>&1 || exit 0

# timeout gibt es im Cloud-Container (Linux), auf dem Mac nicht.
warte=""; command -v timeout >/dev/null 2>&1 && warte="timeout 120"
export TP_GODMODE_INSTALL=1
if ! $warte claude plugin install godmode --marketplace NoobyGains/godmode --scope project >/dev/null 2>&1; then
  echo "  godmode-Plugin nicht installiert (kein Netz zu GitHub?). Die Regeln aus AGENTS.md gelten trotzdem."
fi
exit 0
