# Control Center – Changelog als Einzeldateien

Seit 2026-10-29 schreibt jede Sitzung ihren Changelog-Eintrag als **eigene Datei in diesen
Ordner**, nicht mehr oben in [`../CHANGELOG.md`](../CHANGELOG.md). Die alte Datei ist
eingefroren und bleibt als Verlauf bis zum 29.10.2026 stehen.

**Warum:** Jeder PR schrieb seinen Eintrag oben in dieselbe Datei. Lokal löste der
Merge-Treiber `merge=union` das auf, GitHub wertet Merge-Treiber aber nicht aus – nach jedem
Merge nach `main` standen alle anderen offenen PRs mit Eintrag als CONFLICTING, die
PR-Validierung startete nicht, und jemand musste `origin/main` von Hand in jeden Branch mergen
(27 Nachzieh-Merges allein am 29.10.2026). Eine Datei je Eintrag berührt keine fremde Zeile:
es gibt nichts mehr zu mergen. Hintergrund: `docs/lessons/pr-basis-und-historie.md`.

## Dateiname

`JJJJ-MM-TT-<kurzname>.md` – Datum des Eintrags, dann ein Kurzname nur aus Kleinbuchstaben,
Ziffern und Bindestrichen (kein Umlaut, kein Leerzeichen), z. B.
`2026-10-29-changelog-einzeldateien.md`. Eine Datei je PR; zwei Einträge am selben Tag
unterscheiden sich im Kurznamen. Diese README ist die einzige Datei ohne Datum.

## Inhalt

Erste Zeile ist die Überschrift mit demselben Datum wie der Dateiname, dann die vier
Abschnitte als Aufzählung – wie bisher in `CHANGELOG.md`:

```markdown
## 2026-10-29 · Kurzer Titel, was sich für die Nutzer ändert (#PR)

- **Geaendert:** was und warum, in den Worten der Nutzer.
- **Getestet:** Befehle und Ergebnis mit Zahlen (`npm run -s pruefen` grün, Klickstrecke …).
- **Risiken/Annahmen:** was offen bleibt oder vorausgesetzt wird.
- **Nächste Stufe:** was danach kommt, oder „keine“.
```

Die Schreibweisen `Geändert`/`Geaendert`, `Risiken`/`Risiken/Annahmen` und
`Nächste`/`Naechste Stufe` sind gleichwertig; Lieferanten nur als Pseudonym (AGENTS.md, Punkt 8).

## Lesen und prüfen

```
npm run -s changelog                 # die letzten 10 Einträge, neueste zuerst
npm run -s changelog -- --letzte 25  # mehr
npm run -s changelog -- --namen      # nur die Dateinamen
npm run changelog:guard              # Dateiname, Kopfzeile, Pflichtabschnitte; CHANGELOG.md eingefroren
```

Der Guard läuft in `npm run -s pruefen` und damit in der PR-Validierung. Ein Branch aus
einer älteren Arbeitskopie, der noch in `CHANGELOG.md` schreibt, scheitert dort und verschiebt
seinen Eintrag in eine Datei hier; `npm run pr:doctor` warnt vorher. Aus diesen Dateien wird
nichts erzeugt und committet – ein mit-committetes Sammeldokument hätte denselben Konflikt.
