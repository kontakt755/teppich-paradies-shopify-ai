---
name: codex
description: Direkt mit Codex (OpenAI, lokal mit ChatGPT angemeldet) sprechen - Frage stellen, Rueckfragen im selben Gespraech, Diff oder Plan gegenlesen lassen. Verwenden bei "frag Codex", "Codex soll draufschauen", "zweite Meinung von Codex", "besprich das mit Codex", fuer den Review-Blick vor dem Merge kritischer PRs (Preise, SKUs, Varianten, Massenimporte, Checkout, Deploy-Kette) und wenn eine Annahme gegen eine zweite KI geprueft werden soll.
---

# Mit Codex sprechen

Codex laeuft als Kommandozeile aus der ChatGPT-App
(`/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`, nicht im
PATH), angemeldet mit dem ChatGPT-Konto. Kein API-Key, nichts im Repository.
Das Skript `scripts/ki-austausch.mjs` findet die CLI selbst
(sonst `CODEX_BIN` setzen) und merkt sich die Gespraeche.

## Aufruf

```bash
npm run -s ki:frag -- codex "FRAGE"                  # neues Gespraech
npm run -s ki:frag -- weiter codex "RUECKFRAGE"      # dasselbe Gespraech fortsetzen
git diff origin/main...HEAD | npm run -s ki:frag -- codex --faden pr-1234 "Reviewe diesen Diff auf Fehler."
npm run -s ki:frag -- faeden                          # gemerkte Gespraeche
```

- Codex laeuft **nur lesend** (`--sandbox read-only`, auch beim Fortsetzen) in
  der aktuellen Arbeitskopie und kennt `AGENTS.md`. Er darf Dateien lesen und
  lesende Befehle ausfuehren, aber nichts schreiben.
- `--faden <name>` fuer parallele Gespraeche (z. B. je PR), sonst heisst das
  Gespraech `codex` und wird beim naechsten neuen ueberschrieben.
- `--aufwand low|medium|high|xhigh` setzt die Denktiefe; Standard ist die
  Einstellung aus `~/.codex/config.toml` (sehr hoch, also langsam). Fuer kurze
  Rueckfragen `--aufwand low`.
- Bash-Timeout auf 600000 ms setzen; lange Reviews im Hintergrund laufen lassen.
- Die Antwort steht auf stdout, der Hinweis zum Fortsetzen auf stderr.
- Die andere KI bekommt keine Zugangsdaten aus der Umgebung: Variablen mit
  TOKEN/SECRET/PASSWORD/API_KEY im Namen und alle `SHOPIFY_*`, `GH_*`,
  `GITHUB_*`, `LEXWARE_*`, `SUMUP_*`, `AWS_*` sowie `SSH_AUTH_SOCK` werden
  entfernt (Codex behaelt nur seine eigenen `OPENAI_*`/`CODEX_*`).

## PR-Review mit festem Pruefgegenstand

```bash
npm run -s ki:frag -- review 1234                    # Review des aktuellen PR-Heads
npm run -s ki:frag -- review 1234 "Runde 2: bitte P2 aus Runde 1 nachpruefen"
npm run -s ki:frag -- review-stand 1234              # Exit 0 nur, wenn das letzte Review zum Head passt
```

- `review` holt Head-Commit und Diff per `gh`, bricht ab, wenn sich der Head
  dabei aendert, und laesst Codex in einer sauberen Kopie genau dieses Commits
  pruefen (temporaerer Worktree `.claude/worktrees/_pruefung-pr<N>-<sha>`,
  danach entfernt). Ergebnis: `.git/ki-austausch/reviews/pr-<N>-<sha12>.md`
  mit Kopfzeile (PR, Commit, Runde, Zeit) und Befundzeile (P1/P2/P3).
- Folgerunden laufen im Faden `pr-<N>`, Codex kennt also seine fruehere Kritik.
  Ab Runde 4 warnt das Skript: dann die Ursache klaeren statt weiterzudrehen
  (`AGENTS.md`, „Zusammenarbeit Claude und Codex“).
- `review-stand` meldet `aktuell`, `veraltet` (neuer Commit seit dem Review)
  oder `fehlt`; nur `aktuell` endet mit Exit 0.
- Eine freie Frage mit Diff per stdin (`codex --faden …`) ist eine zweite
  Meinung, aber kein an einen Commit gebundenes Review.

## Gegenrichtung

Codex fragt Claude mit `npm run -s ki:frag -- claude "FRAGE"` (Claude-CLI im
Plan-Modus, nur lesend). Dafuer muss die eigenstaendige Claude-CLI
(`~/.local/bin/claude`) angemeldet sein - die Desktop-App reicht nicht. Meldet
das Skript "Anmeldung fehlt", startet der Benutzer einmal `claude` im Terminal
und meldet sich mit `/login` beim Claude-Abo an.

Ein Schleifenschutz (`TP_KI_TIEFE`) laesst hoechstens Claude -> Codex -> Claude zu.

## Regeln

- Codex ist eine zweite Meinung, keine Quelle. Aussagen ueber Produktdaten,
  Preise oder Shopify-Zustand vor dem Weitergeben selbst pruefen.
- Keine Secrets, Kundendaten, Rabattcodes oder echten Lieferantennamen in die
  Frage (Pseudonyme wie im Repository).
- Antwort zusammenfassen und kennzeichnen ("Codex meint: ..."); wo Claude
  anderer Meinung ist, das sagen und begruenden.
- Arbeit, die Dateien aendert, nicht ueber diesen Weg vergeben - das bleibt eine
  Uebergabe (`Zusammenarbeit/` im Vault, nur auf ausdruecklichen Auftrag).

## Stoerungen

- "Codex-CLI nicht gefunden": ChatGPT-App fehlt oder liegt woanders; `CODEX_BIN` setzen.
- Anmeldefehler bei Codex: Benutzer startet die ChatGPT-App bzw. `codex login`.
- Kontingent erschoepft: das Skript erkennt Limit-/429-Meldungen und endet mit
  **Exit 3**. Nicht wiederholen - Stand sichern (`npm run -s handoff`), allein
  weiterarbeiten oder aufhoeren und den Benutzer informieren.
