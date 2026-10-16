# Git Hooks für Branch-Safety

Dieses Verzeichnis enthält Sicherheits-Hooks, die verhindern, dass Änderungen auf Feature-Branches "verloren gehen".

## Installation

Der Hook wirkt nur auf Rechnern, auf denen er installiert ist – Git uebernimmt
ihn nicht aus dem Repository. Stand 2026-10-16 ist er auf dem Mac **nicht**
installiert (im Hauptcheckout liegen unter `.git/hooks/` nur `*.sample`,
`core.hooksPath` ist leer). Husky ist nicht im Projekt.

### Manuell in `.git/hooks/pre-commit` (im Hauptcheckout)

Worktrees teilen sich das Hook-Verzeichnis des Hauptcheckouts; dort einmal
installieren (in einem Worktree ist `.git` eine Datei, kein Ordner):

```bash
cp .claude/hooks/pre-commit-unmerged-branch.sh "$(git rev-parse --git-common-dir)/hooks/pre-commit"
chmod +x "$(git rev-parse --git-common-dir)/hooks/pre-commit"
```

### Nicht verwenden: `core.hooksPath .claude/hooks`

Git sucht dort eine Datei namens `pre-commit`; das Skript heisst
`pre-commit-unmerged-branch.sh` und wuerde nie aufgerufen. Zugleich waeren alle
anderen Git-Hooks des Rechners abgeschaltet.

## Was die Hooks tun

### `pre-commit-unmerged-branch.sh`

Prüft vor jedem Commit:
- ✅ Du bist auf `main`? → Alles OK
- ✅ Dein aktueller Branch ist in `main` gemergt? → Alles OK
- ⚠️ Dein Branch ist älter als 7 Tage und **nicht** gemergt? → **Warnung**
- ❌ Dein Branch ist älter als 30 Tage und **nicht** gemergt? → **Commit blockiert**

**Grund:** Das ist die Art von Branch, auf dem Änderungen "verloren gehen", weil sie nie nach main gemergt werden.

## Deploy-Gate: `npm run unmerged:guard`

Läuft vor jedem Deploy (`workflow:preview` / `workflow:live`):
- Blockiert wenn du Dateien aus `blocks/`, `sections/`, `templates/` auf einem ungemergten Branch ändern willst
- Erzwingt: Erst mergen, dann deployen

## Testen

```bash
# Hook testen (sollte OK sein, wir sind auf main)
bash .claude/hooks/pre-commit-unmerged-branch.sh

# Guard testen
npm run unmerged:guard

# Doctor testet beide automatisch
npm run workflow:doctor
```
