#!/bin/bash
# Zieht den Hauptcheckout beim Sitzungsstart auf origin/main nach.
#
# Warum: Der Hauptcheckout steht losgeloest auf origin/main und wird nie
# bearbeitet (AGENTS.md "Arbeitskopien"). Nachgezogen wurde er nur von Hand -
# am 2026-10-16 stand er 95 Commits zurueck, Sitzungen und geplante Aufgaben,
# die dort starten, arbeiteten mit Regeln und Hooks vom Vortag
# (docs/analyse/claude-system-2026-10-16.md, Optimieren Nr. 4).
#
# Tut nur etwas, wenn alles drei gilt:
#   - das Verzeichnis ist der Hauptcheckout (git-dir ist ".git", kein Worktree),
#   - HEAD ist losgeloest (auf einem Branch arbeitet jemand - nicht anfassen),
#   - keine geaenderten oder vorgemerkten Dateien. Unversionierte Dateien
#     stoeren nicht: git checkout ueberschreibt sie nie, sondern bricht ab.
# Sonst: nichts tun, nichts ausgeben. Fehler (kein Netz, Sperre, Konflikt)
# werden geschluckt; der Sitzungsstart darf daran nie scheitern.
#
# Aufruf: bash hauptcheckout-nachziehen.sh [verzeichnis]   (Standard: aktuelles)

cd "${1:-.}" 2>/dev/null || exit 0

# Netzaufrufe hart begrenzen: ohne Netz haengt git fetch sonst bis zum
# TCP-Timeout. macOS hat kein "timeout", perl ist immer da.
mit_zeitlimit() {
  if command -v timeout >/dev/null 2>&1; then
    timeout 20 "$@"
  elif command -v perl >/dev/null 2>&1; then
    perl -e 'alarm shift; exec @ARGV' 20 "$@"
  else
    "$@"
  fi
}

# Remote-Sessions (claude.ai/code) bekommen ihren Stand von der Plattform.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && exit 0
[ "$(git rev-parse --git-dir 2>/dev/null)" = ".git" ] || exit 0
git symbolic-ref -q HEAD >/dev/null 2>&1 && exit 0
[ -z "$(git status --porcelain --untracked-files=no 2>/dev/null)" ] || exit 0

mit_zeitlimit git fetch -q origin >/dev/null 2>&1 || exit 0
git checkout -q --detach origin/main >/dev/null 2>&1 || true
exit 0
