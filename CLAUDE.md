# TeppichParadies — Claude Code

@AGENTS.md

Alles Verbindliche steht in `AGENTS.md` (gilt fuer Claude und Codex) und wird
oben eingebunden. Hier steht nur, was Claude Code zusaetzlich betrifft.

## Sitzung

- **Ein Modell fuer alles.** Standard kommt aus `~/.claude/settings.json`
  (Opus, Effort xhigh). Es gibt keinen Router, keine Voranalyse und keinen
  Modellwechsel mitten in der Sitzung (entfernt 2026-09-30, siehe `.claude/README.md`).
- **Sitzungen im Repository starten**, nicht auf dem Schreibtisch oder im
  Home-Ordner — sonst fehlen Hooks, Skills und das Projekt-Gedaechtnis.
- **Eine Aufgabe pro Sitzung, eigener Worktree** (App-Worktree unter
  `.claude/worktrees/`). Den Hauptcheckout nie bearbeiten.
- **Grosse Ausgaben aus dem Kontext halten:** breite Suchen ueber viele Dateien
  an einen Subagenten geben; gefiltert statt roh
  (`npm run -s kurz -- themes-query | themes | push | worktrees`);
  `live-theme.json` nur per `jq '{live,preview,fallback,arbeit}'` lesen
  (die Retired-Liste ist lang).
- **Uebergabe** an die naechste Sitzung: `npm run -s handoff`.

## Skills

| Skill | Wann |
|---|---|
| `deploy` | „deploy“, „live stellen“, Gate-Abbrueche, bevor etwas in ein Theme gepusht wird |
| `control-center` | Dashboard (`docs/ai-dashboard/`), `issues.json`, `npm run task` |
| `produktimport` | neue Produkte aus Lieferantenquellen, Schreibzugriff (`shopify-daten.md`) |
| `lieferant-a-recherche` | Artikel- und Farbnummern bei Lieferant A belegt klaeren |
| `shopify-massendaten` | viele Metafelder/Tags auf einmal, mit Plan und Rollback |
| `raumbilder-recherche` | Produkte ohne Raumbild: Hersteller hinter dem Lieferantenprodukt finden, farbgenaue Raumbilder aus erlaubten Quellen suchen |

## Review

Kein Pflicht-Review. Fuer die in `AGENTS.md` genannten kritischen Aenderungen
vor dem Merge `/code-review` auf den PR ausfuehren (oder Codex auf den PR-Diff).

## Hooks und Berechtigungen

Claude arbeitet ohne Rueckfragen (Entscheidung Ahmet, 2026-09-11); die Grenzen
aus `AGENTS.md` gelten trotzdem. **Keine `permissions.ask`-Regeln anlegen** —
sie fragen in jedem Modus nach. Harte Grenzen gehoeren als `deny` in
`.claude/hooks/git-gh-guard.mjs`. Aktive Hooks: Guards fuer git/gh, Theme-Loeschen
und Deploy-Befehle, Gedaechtnis-Sync (Start/Ende), Projektzustand in
Remote-Sessions. Details: `.claude/README.md`.

In Remote-Sessions (claude.ai/code) ist die Storefront per Egress-Policy
gesperrt: dort nur `node workflow/cli.mjs validate --static`, Deploys laufen lokal.
