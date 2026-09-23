# Ratgeber im Control Center

Stand 2026-09-23 · Paket P3. Ergaenzt `docs/ai-dashboard/` (Control Center,
Konzept in `docs/control-center/`) um einen Bereich, der den Stand der
Bodenwissen-Inhalte zeigt. Der Auftrag steht in `ANALYTICS.md`, Abschnitt 6.

## Woher die Zahlen kommen

```
node scripts/build-bodenwissen-data.mjs
```

liest `content/ratgeber/`, `content/lexikon/` und `content/probleme/` direkt
aus dem Repository und schreibt `docs/ai-dashboard/bodenwissen.json`. Kein
GitHub- und kein Google-Aufruf, keine Netzwerkverbindung — dieselbe Regel wie
bei `issues.json` (`docs/control-center/ARCHITEKTUR.md`, Abschnitt 1): Das
Frontend liest ausschliesslich die erzeugte Datei.

Die Redaktionslogik selbst (Statusliste, Pflichtfelder, Kannibalisierung,
tote Links, Problem-Finder-Sperre) kommt **importiert** aus
`scripts/bodenwissen-guard.mjs` (`STATUS`, `pruefe()`) — nicht als zweite,
abweichende Kopie. Wenn sich das Gate aendert, aendert sich dieser Bereich mit,
ohne dass hier etwas angepasst werden muss.

Die Datei wird vom Workflow `.github/workflows/dashboard-data.yml` erzeugt und
mitcommittet — im selben Lauf wie `issues.json`. Ausgeloest wird er von Pushes
auf `main`, die `content/ratgeber/`, `content/lexikon/`, `content/probleme/`,
`scripts/build-bodenwissen-data.mjs` oder `scripts/bodenwissen-guard.mjs`
anfassen, dazu alle 30 Minuten als Sicherheitsnetz. Ein Handlauf
(`npm run bodenwissen:daten`) ist damit nur noch fuer die lokale Ansicht
noetig — fuer Inhalte, die noch nicht auf `main` liegen. Die Zeile am
Seitenende („Stand: …") zeigt `erzeugtAm` aus dem Lauf, der die Datei zuletzt
geschrieben hat.

## Was der Bereich zeigt

| Kachel/Abschnitt | Quelle in `bodenwissen.json` | Bedeutung |
|---|---|---|
| Content-Pipeline | `contentPipeline` (Reihenfolge `statusReihenfolge`) | Artikelzahl je Status, inklusive Status mit 0 Artikeln — Statusliste kommt aus `bodenwissen-guard.mjs`, nicht abgeschrieben |
| Überarbeitung fällig | `ueberarbeitungsbedarf` | Artikel, deren `pruefung.naechste` vor heute liegt — unabhaengig vom Status, nicht nur bei `veroeffentlicht` (das Gate selbst meldet nur dort einen Hinweis) |
| Offene Bildbedarfe | `bilder.offen`, `bilder.items` | Eintraege aus `bilder[]` mit `status: "offen"`, ueber alle Artikel |
| Offener Expert Input | `expertInput.gesamt/ratgeber/lexikon/items` | Einzelne `expert_input`-Fragen, gezaehlt aus Ratgeber-Artikeln **und** Lexikon, mit Quelle je Eintrag |
| Problem-Finder | `problemFinder.gesamt/mitZiel/ohneZiel` | Eintraege aus `content/probleme` mit und ohne gesetztes Feld `artikel` |
| Gate | `gate.fehler`, `gate.hinweise`, `gate.zahlen` | 1:1 das Ergebnis von `pruefe()` aus `bodenwissen-guard.mjs`; Pfade sind relativ zum Repo-Root (Multi-Mac, `docs/MULTI_MAC_WORKFLOW.md`), nie absolut |
| Suchleistung | `suchleistung` (immer `null`), `suchleistungHinweis` | siehe unten |

Fehlt `docs/ai-dashboard/bodenwissen.json` (noch nie erzeugt, frischer
Checkout), zeigt der Bereich einen ruhigen Hinweis mit dem Befehl zum Erzeugen
— keinen Fehler und keinen Absturz. Das ist getestet
(`docs/ai-dashboard/tests/bodenwissen.test.mjs`).

## Was bewusst fehlt

**Suchleistung** (Klicks, Impressionen, CTR, Position, Non-Brand-Anteil,
Quick-Win-Kandidaten, neue Nutzerfragen, Suchanfragen ohne Treffer) ist nicht
Teil dieses Pakets. `bodenwissen.json` traegt dafuer das Feld
`suchleistung: null` plus `suchleistungHinweis` als Text; die Oberflaeche
zeigt ausdruecklich **„Daten noch nicht verfügbar“** mit diesem Hinweis —
nie eine 0 oder ein leeres Diagramm, das wie eine Messung aussieht. Das ist
die wichtigste Anforderung an diesen Bereich (`ANALYTICS.md`, Abschnitt 6b)
und ebenfalls getestet.

**Freigeschaltet wird das erst**, wenn GA4 und Search Console angebunden sind
— eine eigene, noch offene Entscheidung (Repository ist oeffentlich, siehe
`docs/control-center/BESTANDSAUFNAHME.md`, Punkt 4, und
`docs/control-center/ARCHITEKTUR.md`, Abschnitt 7 „Nicht-Ziele"). Erst danach
ergibt eine Quick-Win-Liste (`ANALYTICS.md`, Abschnitt 7) ueberhaupt Daten.

**Nur lokal sichtbar, wie der Rest des Control Centers.** Seit 2026-09-23
laeuft das gesamte Control Center nur noch lokal (`ARCHITEKTUR.md`,
Abschnitt 1); `render()` in `app.js` zeigt in jeder Ansicht „Nur lokal im
Betrieb", solange `/api/capabilities` nicht antwortet. Der Ratgeber-Bereich
folgt dieser bestehenden Regel, obwohl `bodenwissen.json` selbst — anders als
die Einkaufsdaten — keine privaten Daten enthaelt (Content-Redaktionsstand,
keine Kunden- oder Umsatzdaten). Eine gezielte Ausnahme fuer diesen einen
Bereich wurde hier nicht gebaut, um die eine bestehende Regel nicht durch eine
zweite, abweichende zu ersetzen.

## Wo der Code liegt

- `scripts/build-bodenwissen-data.mjs` — erzeugt `bodenwissen.json`, reine
  Zaehlfunktionen einzeln exportiert und getestet
  (`docs/ai-dashboard/tests/build-bodenwissen-data.test.mjs`)
- `docs/ai-dashboard/lib/bodenwissen.mjs` — Anzeige-Logik ohne DOM-Abhaengigkeit
  (Ladezustand, Statustext, Suchleistungs-Hinweis), getestet in
  `docs/ai-dashboard/tests/bodenwissen.test.mjs` — Muster: `lib/model.mjs`
- `docs/ai-dashboard/app.js` — `viewRatgeber()` und `ensureBodenwissen()`,
  Navigationspunkt „Ratgeber" in `index.html`, eingebunden ueber `#/ratgeber`
- `.github/workflows/dashboard-data.yml` — baut `bodenwissen.json` und
  `issues.json` im selben Lauf und committet nur die Datei, die sich
  tatsaechlich geaendert hat
