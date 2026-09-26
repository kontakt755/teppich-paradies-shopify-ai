#!/bin/bash
# Gedaechtnis-Sync (#665): haelt Claudes Gedaechtnis-Ordner ueber ein privates
# Git-Repo zwischen mehreren Macs gleich. SessionStart: pull. Stop: commit+push.
#
# Warum: ab 2026-09-26 arbeiten zwei Rechner (zuhause / Laden). Was Claude auf
# dem einen lernt, muss der andere kennen, sonst graebt er dieselbe Falle neu aus.
# Cloud-Ordner scheiden aus (docs/MULTI_MAC_WORKFLOW.md), deshalb Git.
#
# Regeln:
#   - Nie blockieren. Jeder Fehler endet still mit Exit 0 (kein Netz, kein Repo).
#   - Ordner ohne .git: nichts tun. Der Sync ist eine Zugabe, keine Pflicht.
#   - Beim Rebase ist --theirs die EIGENE, gerade wiedergespielte Arbeit
#     (docs/lessons/rebase-ours-ist-der-upstream.md). Bei Konflikt gewinnt sie.
#   - Aufruf: gedaechtnis-sync.sh pull|push [ordner]. Ordner-Standard ist der
#     Gedaechtnis-Ordner dieses Projekts unter ~/.claude/projects.
set -u
MODUS="${1:-}"
PROJEKT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
STANDARD="$HOME/.claude/projects/$(printf '%s' "$PROJEKT" | sed 's#/#-#g')/memory"
ORDNER="${2:-${TP_GEDAECHTNIS_DIR:-$STANDARD}}"

case "$MODUS" in pull|push) ;; *) echo "Aufruf: gedaechtnis-sync.sh pull|push [ordner]" >&2; exit 2 ;; esac
[ -d "$ORDNER/.git" ] || exit 0
cd "$ORDNER" || exit 0
git remote get-url origin >/dev/null 2>&1 || exit 0

case "$MODUS" in
  pull)
    git pull -q --rebase --autostash origin main >/dev/null 2>&1 || git rebase --abort >/dev/null 2>&1
    ;;
  push)
    git add -A >/dev/null 2>&1
    git diff --cached --quiet || git commit -q -m "Gedaechtnis $(hostname -s) $(date +%Y-%m-%d_%H:%M)" >/dev/null 2>&1
    if ! git pull -q --rebase origin main >/dev/null 2>&1; then
      git checkout --theirs . >/dev/null 2>&1
      git add -A >/dev/null 2>&1
      GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || git rebase --abort >/dev/null 2>&1
    fi
    git push -q origin main >/dev/null 2>&1
    ;;
esac
exit 0
