#!/bin/bash
# Gedaechtnis-Sync (#665): haelt Claudes Gedaechtnis-Ordner ueber ein privates
# Git-Repo zwischen mehreren Macs gleich. SessionStart: pull. Stop: commit+push.
#
# Warum: ab 2026-09-26 arbeiten zwei Rechner (zuhause / Laden). Was Claude auf
# dem einen lernt, muss der andere kennen, sonst graebt er dieselbe Falle neu aus.
# Cloud-Ordner scheiden aus (docs/MULTI_MAC_WORKFLOW.md), deshalb Git.
#
# Spiegel (seit 2026-09-27): Der Gedaechtnis-Ordner ist zugleich der Obsidian-
# Vault. Damit dort das ganze Projektwissen steht, kopiert jeder Lauf zusaetzlich
# CLAUDE.md, AGENTS.md, docs/lessons/ und die Skill-Beschreibungen aus dem
# Repository nach <vault>/Projektwissen/. Quelle ist immer das Repository; die
# Kopie im Vault ist nur zum Lesen. Codex ruft dasselbe Skript ueber
# `npm run gedaechtnis:sync -- pull|push` auf.
#
# Regeln:
#   - Nie blockieren. Jeder Fehler endet still mit Exit 0 (kein Netz, kein Repo).
#   - Ordner ohne .git: nichts tun. Der Sync ist eine Zugabe, keine Pflicht.
#   - Beim Rebase ist --theirs die EIGENE, gerade wiedergespielte Arbeit
#     (docs/lessons/rebase-ours-ist-der-upstream.md). Bei Konflikt gewinnt sie.
#   - Aufruf: gedaechtnis-sync.sh pull|push|spiegel [ordner]. Ordner-Standard ist
#     der Gedaechtnis-Ordner dieses Projekts unter ~/.claude/projects.
set -u
MODUS="${1:-}"
PROJEKT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
STANDARD="$HOME/.claude/projects/$(printf '%s' "$PROJEKT" | sed 's#/#-#g')/memory"
ORDNER="${2:-${TP_GEDAECHTNIS_DIR:-$STANDARD}}"

case "$MODUS" in pull|push|spiegel) ;; *) echo "Aufruf: gedaechtnis-sync.sh pull|push|spiegel [ordner]" >&2; exit 2 ;; esac
[ -d "$ORDNER" ] || exit 0

# Projektwissen aus dem Repository in den Vault kopieren (nur Repo -> Vault).
spiegeln() {
  local ziel="$ORDNER/Projektwissen"
  mkdir -p "$ziel/Lessons" "$ziel/Skills" || return 0
  cp -f "$PROJEKT/CLAUDE.md" "$ziel/CLAUDE.md" 2>/dev/null
  cp -f "$PROJEKT/AGENTS.md" "$ziel/AGENTS.md" 2>/dev/null
  [ -d "$PROJEKT/docs/lessons" ] && rsync -a --delete --include='*.md' --exclude='*' "$PROJEKT/docs/lessons/" "$ziel/Lessons/" 2>/dev/null
  if [ -d "$PROJEKT/.claude/skills" ]; then
    local s
    for s in "$PROJEKT"/.claude/skills/*/; do
      [ -f "$s/SKILL.md" ] || continue
      rsync -a --delete --include='*.md' --exclude='*' "$s" "$ziel/Skills/$(basename "$s")/" 2>/dev/null
    done
  fi
  cat > "$ziel/README.md" <<EOF
# Projektwissen (Spiegel, nur lesen)

Kopie aus dem Repository \`teppich-paradies-shopify-ai\`, Stand $(date +%Y-%m-%d\ %H:%M) auf $(hostname -s).
Aenderungen gehoeren ins Repository (Branch, PR, main) — nicht hierher; der naechste
Sync ueberschreibt diesen Ordner.

- [[CLAUDE]] — Kurzfassung der Regeln fuer den Sitzungsalltag
- [[AGENTS]] — verbindliche Regeln, zuerst lesen
- Lessons/ — die Vorfaelle hinter jeder Regel (\`docs/lessons/\`)
- Skills/ — Arbeitsanleitungen je Thema (\`.claude/skills/*/SKILL.md\`)

Erkenntnisse aus Sitzungen (Claude wie Codex) liegen als einzelne Notizen im
Vault-Stamm und sind in [[../MEMORY]] verzeichnet.
EOF
}

if [ "$MODUS" = spiegel ]; then spiegeln; exit 0; fi

[ -d "$ORDNER/.git" ] || { spiegeln; exit 0; }
cd "$ORDNER" || exit 0
git remote get-url origin >/dev/null 2>&1 || { spiegeln; exit 0; }

case "$MODUS" in
  pull)
    git pull -q --rebase --autostash origin main >/dev/null 2>&1 || git rebase --abort >/dev/null 2>&1
    spiegeln
    ;;
  push)
    spiegeln
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
