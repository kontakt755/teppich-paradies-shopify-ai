# Git Hooks für Branch-Safety

Dieses Verzeichnis enthält Sicherheits-Hooks, die verhindern, dass Änderungen auf Feature-Branches "verloren gehen".

## Installation

Der Hook wirkt nur auf Rechnern, auf denen er installiert ist – Git uebernimmt
ihn nicht aus dem Repository. Husky ist nicht im Projekt.

**Stand 2026-10-16:** auf dem Mac seit 16.10. installiert, als **Kopie** in
`.git/hooks/pre-commit` des Hauptcheckouts. Eine Kopie bleibt auf dem Stand des
Tages, an dem sie kopiert wurde – die Umstellung auf `origin/main` (siehe unten)
erreicht sie nicht. Nach dem Merge deshalb einmal durch den Aufrufer unten
ersetzen; danach folgt der Hook dem Repository von selbst.

### Empfohlen: Aufrufer in `.git/hooks/pre-commit` (im Hauptcheckout)

Worktrees teilen sich das Hook-Verzeichnis des Hauptcheckouts (in einem
Worktree ist `.git` eine Datei, kein Ordner). Der Aufrufer startet das Skript
aus der Arbeitskopie, in der gerade committet wird; fehlt es dort (alter
Branch), laeuft der Commit ohne Pruefung durch:

```bash
cat > "$(git rev-parse --git-common-dir)/hooks/pre-commit" <<'HOOK'
#!/bin/bash
skript="$(git rev-parse --show-toplevel)/.claude/hooks/pre-commit-unmerged-branch.sh"
[ -f "$skript" ] || exit 0
exec bash "$skript"
HOOK
chmod +x "$(git rev-parse --git-common-dir)/hooks/pre-commit"
```

### Alternative: Kopie

```bash
cp .claude/hooks/pre-commit-unmerged-branch.sh "$(git rev-parse --git-common-dir)/hooks/pre-commit"
chmod +x "$(git rev-parse --git-common-dir)/hooks/pre-commit"
```

Muss nach jeder Aenderung am Skript wiederholt werden.

### Nicht verwenden: `core.hooksPath .claude/hooks`

Git sucht dort eine Datei namens `pre-commit`; das Skript heisst
`pre-commit-unmerged-branch.sh` und wuerde nie aufgerufen. Zugleich waeren alle
anderen Git-Hooks des Rechners abgeschaltet.

## Was die Hooks tun

### `pre-commit-unmerged-branch.sh`

Prüft vor jedem Commit:
- ✅ Du bist auf `main` oder losgelöst (Hauptcheckout)? → Alles OK
- ✅ Dein aktueller Branch ist in `origin/main` gemergt? → Alles OK. Seit 16.10.
  gegen `origin/main`, nicht gegen das lokale `main`: das gehört dem
  Deploy-Worktree und hinkt oft hinterher. Ohne Remote gilt das lokale `main`.
- ⚠️ Dein Branch ist älter als 7 Tage und **nicht** gemergt? → **Warnung**
- ❌ Dein Branch ist älter als 30 Tage und **nicht** gemergt? → **Commit blockiert**

**Grund:** Das ist die Art von Branch, auf dem Änderungen "verloren gehen", weil sie nie nach main gemergt werden.

## Deploy-Gate: `npm run unmerged:guard`

Läuft vor jedem Deploy (`workflow:preview` / `workflow:live`):
- Blockiert wenn du Dateien aus `blocks/`, `sections/`, `templates/` auf einem ungemergten Branch ändern willst
- Erzwingt: Erst mergen, dann deployen

## Testen

```bash
# Hook testen (still, wenn der Branch frisch oder schon gemergt ist)
bash .claude/hooks/pre-commit-unmerged-branch.sh

# Automatische Tests mit Wegwerf-Repository (Teil von npm test)
node --test qa/tests/git-hook-skripte.test.mjs

# Guard testen
npm run unmerged:guard

# Doctor testet beide automatisch
npm run workflow:doctor
```
