# TeppichParadies — Claude Code

## Modellwahl und effiziente Ressourcennutzung – hoechste Prioritaet

Waehle fuer jede Aufgabe eigenstaendig das am besten geeignete verfuegbare KI-Modell.

Grundprinzip: So schnell und kostenguenstig wie moeglich, aber so leistungsfaehig wie noetig.

* Einfache Aufgaben: schnelle, kostenguenstige Modelle fuer Routinearbeiten, Dateisuche, einfache Codeaenderungen, Formatierungen und Zusammenfassungen.
* Mittlere Aufgaben: ausgewogene Modelle fuer normale Programmierung, Fehlerbehebungen, Analysen und die Umsetzung klar definierter Funktionen.
* Komplexe Aufgaben: leistungsstarke Modelle fuer Architekturentscheidungen, schwierige Fehleranalysen, sicherheitskritische Aenderungen und umfangreiche Programmieraufgaben.
* Aufgaben aufteilen: einfache Teilaufgaben moeglichst an guenstigere Subagenten delegieren, sofern das insgesamt Ressourcen spart.
* Eskalation: nur dann zu einem leistungsfaehigeren Modell wechseln, wenn Komplexitaet, Risiko oder fehlgeschlagene Loesungsversuche es rechtfertigen.
* Qualitaetskontrolle: nie auf Kosten von Zuverlaessigkeit, Sicherheit oder korrekten Ergebnissen sparen.
* Keine unnoetigen Modellwechsel: den Aufwand durch Kontextuebertragung, erneutes Einlesen und Koordination mitrechnen.

Diese Entscheidung trifft Claude automatisch und ohne Rueckfrage, soweit die Umgebung eine Modellauswahl unterstuetzt.
Ziel ist die bestmoegliche Kombination aus Qualitaet, Geschwindigkeit, Tokenverbrauch und Kosten.

@AGENTS.md

Alles Verbindliche steht in `AGENTS.md` (gilt fuer Claude und Codex) und wird
oben eingebunden. Hier steht nur, was Claude Code zusaetzlich betrifft.

## Sitzung

- **Hauptmodell** kommt aus `~/.claude/settings.json`; Subagenten waehlen ihr
  Modell nach der Regel oben. Es gibt keinen Router und keine Voranalyse
  (entfernt 2026-09-30, siehe `.claude/README.md`).
- **Sitzungen im Repository starten**, nicht auf dem Schreibtisch oder im
  Home-Ordner — sonst fehlen Hooks, Skills und das Projekt-Gedaechtnis.
  App-Worktrees liegen unter `.claude/worktrees/`; die Regeln zu Arbeitskopien
  (eine Aufgabe = ein Worktree, Hauptcheckout nie bearbeiten) stehen in `AGENTS.md`.
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
| `shopify-massendaten` | viele Metafelder/Tags auf einmal, mit Plan und Rollback; GraphQL-Fallen der Admin-API (falsche Felder, gesperrte Mutationen) |
| `raumbilder-recherche` | Produkte ohne Raumbild: Hersteller hinter dem Lieferantenprodukt finden, farbgenaue Raumbilder aus erlaubten Quellen suchen |
| `restrollen-bilder` | Zusatzbilder fuer Restrollen (flach vor Wand, Kante mit Lupe, Kettelkante, weiter weg): echte Fotopixel plus Gemini-Hintergrund, Sichtfreigabe, Upload |
| `theme-regeln` | vor jeder Theme-Aenderung: Bloecke/Schemata, fertige Funktionen, Menue, Produktkarten, UX/Design, Bilder, Schrift/Rot, Testumfang |
| `preislogik` | Preise, Streich-/Vergleichspreise, Aktionen, Fussleiste, Paketprodukte (€/m²), Vinyl-Preisfilter |
| `werkzeuge` | alle `npm run`-Guards, Doctors und Pruefungen mit Zweck und Zeitpunkt |
| `theme-audit` | nur lesendes Audit (Performance, SEO, JSON-LD, KI-Abrufbarkeit, App-Last) ergaenzend zu den Guards; Bericht nach `docs/audits/` |
| `codex` | „frag Codex“, zweite Meinung, Diff/Plan gegenlesen, Review-Blick vor kritischen Merges (`npm run -s ki:frag`) |
| `ship` | `/ship <PR-Nummer>`, „merge #N“: Freigabe fuer genau diesen PR - Review bei kritischen Aenderungen, CI, `deploy:frei`, Merge-Commit, `pr:doctor`, Theme-/Dashboard-Deploy, eigene Arbeitskopie entfernen |
| `handoff` | „Uebergabe“, „handoff“, „Prompt fuer neuen Chat“, Kontext wird voll (Auto-Compact bei 50 %, vorher anbieten): `npm run -s handoff` ergaenzen und als einen Block ausgeben |

## Review

Kein Pflicht-Review. Fuer die in `AGENTS.md` genannten kritischen Aenderungen
vor dem Merge den PR pruefen lassen: Codex mit `npm run -s ki:frag -- review <PR>`
(an den Head-Commit gebunden, vor dem Merge `review-stand <PR>`) oder
`/code-review` als Claude-Pruefung. Ablauf allein/mit Codex, Rundenlimit und
Kontingent: `AGENTS.md`, Abschnitt „Zusammenarbeit Claude und Codex“.

## Hooks und Berechtigungen

Claude arbeitet ohne Rueckfragen (Entscheidung Ahmet, 2026-09-11); die Grenzen
aus `AGENTS.md` gelten trotzdem. **Keine `permissions.ask`-Regeln anlegen** —
sie fragen in jedem Modus nach. Harte Grenzen gehoeren als `deny` in
`.claude/hooks/git-gh-guard.mjs`. Aktive Hooks: Guards fuer git/gh, Theme-Loeschen
und Deploy-Befehle, Shopify-MCP-Mutationen (Loeschen, Fallback-Theme), Gedaechtnis-Sync (Start/Ende), Kurzstand des Control Centers
(jede Sitzung) und Projektzustand in Remote-Sessions. Details: `.claude/README.md`.

In Remote-Sessions (claude.ai/code) ist die Storefront per Egress-Policy
gesperrt: dort nur `node workflow/cli.mjs validate --static`, Deploys laufen lokal.
