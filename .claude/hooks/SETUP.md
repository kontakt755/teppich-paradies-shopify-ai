# Git Hooks für Branch-Safety

Dieses Verzeichnis enthält Sicherheits-Hooks, die verhindern, dass Änderungen auf Feature-Branches "verloren gehen".

## Installation

### Option 1: Automatisch mit Husky (empfohlen)

```bash
npm install husky --save-dev
npx husky install
npx husky add .husky/pre-commit "./.claude/hooks/pre-commit-unmerged-branch.sh"
```

### Option 2: Manuell in `.git/hooks/pre-commit`

```bash
cp .claude/hooks/pre-commit-unmerged-branch.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### Option 3: Mit Git-Config (lokal aktivieren)

```bash
git config core.hooksPath .claude/hooks
chmod +x .claude/hooks/pre-commit-unmerged-branch.sh
```

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
