#!/bin/bash
# Gedaechtnis-Sync (#665): haelt Claudes Gedaechtnis-Ordner ueber ein privates
# Git-Repo zwischen mehreren Macs gleich. SessionStart: pull. SessionEnd: commit+push.
#
# Warum: zwei Rechner (zuhause / Laden). Was Claude auf dem einen lernt, muss der
# andere kennen, sonst graebt er dieselbe Falle neu aus. Cloud-Ordner scheiden
# aus (docs/MULTI_MAC_WORKFLOW.md), deshalb Git. Der Ordner ist zugleich der
# Obsidian-Vault. Codex ruft dasselbe Skript ueber
# `npm run gedaechtnis:sync -- pull|push` auf (dort mit --streng).
#
# Bis 2026-09-30 lief push nach jeder Antwort (Stop) und kopierte zusaetzlich
# CLAUDE.md, AGENTS.md, Lessons und Skills nach <vault>/Projektwissen/. Die Kopie
# war eine zweite, oft veraltete Regelquelle; Regeln stehen nur im Repository.
#
# Bis 2026-10-24 leitete das Skript den Ordner aus dem Sitzungsordner ab. In
# einem Worktree (der Normalfall, AGENTS.md "Eine Aufgabe = eine Arbeitskopie")
# ergab das einen Ordner, den es nicht gibt - der Sync tat still nichts, fuer
# Claude wie fuer Codex. Jetzt zaehlt immer der Hauptcheckout des Repositorys.
#
# Regeln:
#   - Als Hook nie blockieren: Exit 0, ein Fehler steht als eine Zeile auf stderr.
#   - --streng (npm run gedaechtnis:sync): Fehler und fehlender Ordner mit Exit 1,
#     damit ein Aufrufer sieht, dass nichts synchronisiert wurde.
#   - Ordner ohne .git oder ohne origin: nichts tun (Sync ist eine Zugabe).
#   - Beim Rebase ist --theirs die EIGENE, gerade wiedergespielte Arbeit
#     (docs/lessons/rebase-ours-ist-der-upstream.md). Bei Konflikt gewinnt sie.
#   - Aufruf: gedaechtnis-sync.sh [--streng] pull|push [ordner]. Ordner-Standard ist
#     der Gedaechtnis-Ordner des Hauptcheckouts unter ~/.claude/projects.
set -u
STRENG=0
if [ "${1:-}" = "--streng" ]; then STRENG=1; shift; fi
MODUS="${1:-}"

case "$MODUS" in pull|push) ;; *) echo "Aufruf: gedaechtnis-sync.sh [--streng] pull|push [ordner]" >&2; exit 2 ;; esac

melde() {
  echo "Gedaechtnis-Sync ($MODUS): $1" >&2
  [ "$STRENG" = 1 ] && exit 1
  # Beim Sitzungsstart landet stdout im Kontext: die Sitzung weiss dann, dass ihr Gedaechtnis alt sein kann.
  [ "$MODUS" = pull ] && echo "Hinweis: Gedaechtnis-Sync ($MODUS): $1"
  exit 0
}

# Hauptcheckout: Elternordner des gemeinsamen .git-Verzeichnisses, gleich fuer
# alle Worktrees. Ausserhalb eines Repositorys bleibt der angegebene Ordner.
hauptcheckout() {
  local start="$1" common
  common=$(git -C "$start" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || { printf '%s' "$start"; return; }
  dirname "$common"
}

START="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
PROJEKT="$(hauptcheckout "$START")"
STANDARD="$HOME/.claude/projects/$(printf '%s' "$PROJEKT" | sed 's#/#-#g')/memory"
ORDNER="${2:-${TP_GEDAECHTNIS_DIR:-$STANDARD}}"

if [ ! -d "$ORDNER" ]; then
  [ "$STRENG" = 1 ] && melde "Ordner fehlt: $ORDNER"
  exit 0
fi
[ -d "$ORDNER/.git" ] || exit 0
cd "$ORDNER" || melde "Ordner nicht lesbar: $ORDNER"
git remote get-url origin >/dev/null 2>&1 || exit 0

case "$MODUS" in
  pull)
    if ! git pull -q --rebase --autostash origin main >/dev/null 2>&1; then
      git rebase --abort >/dev/null 2>&1
      melde "pull fehlgeschlagen (kein Netz oder Konflikt) - lokaler Stand bleibt, Fernstand nicht geholt."
    fi
    ;;
  push)
    # Jeder Schritt wird geprueft: sonst schob push den alten Stand erfolgreich
    # hoch, waehrend die neuen Notizen ungesichert blieben (Codex-Review #1669).
    git add -A >/dev/null 2>&1 || melde "git add fehlgeschlagen - neue Notizen nicht gesichert."
    if ! git diff --cached --quiet; then
      git commit -q -m "Gedaechtnis $(hostname -s) $(date +%Y-%m-%d_%H:%M)" >/dev/null 2>&1 \
        || melde "commit fehlgeschlagen - neue Notizen nicht gesichert."
    fi
    # Nur bei einem Konflikt laeuft ein Rebase; ohne Netz scheitert gleich der push unten.
    if ! git pull -q --rebase origin main >/dev/null 2>&1 && [ -d "$(git rev-parse --git-path rebase-merge)" ]; then
      git checkout --theirs . >/dev/null 2>&1
      git add -A >/dev/null 2>&1
      if ! GIT_EDITOR=true git rebase --continue >/dev/null 2>&1; then
        git rebase --abort >/dev/null 2>&1
        melde "Konflikt mit dem Fernstand nicht loesbar - lokal committet, nicht gepusht."
      fi
    fi
    git push -q origin main >/dev/null 2>&1 \
      || melde "push fehlgeschlagen - Notizen sind lokal committet, aber nicht auf dem anderen Rechner."
    ;;
esac
exit 0
