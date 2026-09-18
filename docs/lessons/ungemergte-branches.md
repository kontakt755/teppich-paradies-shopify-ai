# Fertige Arbeit auf Branches, die nie gemergt wurden

**Regel:** Der Shop zeigt nur, was in `main` ist. Beim Zurueckholen die ganze
Gruppe nehmen, nie die eine Datei. Theme-Dateien vom Branch, Infrastruktur von
`main`. Gates: `essential:guard`, `unmerged:guard`, Pre-Commit-Hook.

## Was passierte

Zwei Faelle am 2026-09-05, beide ueber Wochen unbemerkt:

| Branch | Was darauf lag |
|---|---|
| `claude/teppich-produktseite-redesign-ru2sis` | Wunschmass-Rechner, Produktdetails, 5 Bloecke + Template |
| `feature/design-analyse-quickfixes` | gruener Rollenware-Konfigurator, Schrittfuehrung, Design-System, Musterbestellung — 49 Commits |

Ein Branch ohne Merge ist fuer den Kunden nicht existent. Wer sucht, sucht
deshalb im Git-Verlauf, nicht in der Erinnerung:

```
git log --all --oneline --diff-filter=A -- <pfad>   # wo entstand die Datei
git branch -a --contains <commit>                   # auf welchem Branch liegt sie
git branch -r --no-merged main                      # was ist sonst noch ungemergt
```

## Der zweite Fehler beim Zurueckholen

Am selben Tag wurden `tp-step` und `tp-rollware-anzeige` einzeln gepickt — ihre
Abhaengigkeiten `tp-vertrauen` und `tp-bewertungsbeleg` blieben zurueck, und
Shopify lehnte daraufhin den **gesamten** Template-Push ab. Die Meldung nannte
nur den Block, nicht die Ursache; das kostete eine Stunde.
`npm run essential:guard` findet genau diesen Zustand vorher.

Beim Uebernehmen eines alten Branches: `workflow/`, `qa/`, `package.json` und
`AGENTS.md` sind auf `main` fast immer neuer — ein Branchstand von vor Wochen
dreht dort stillschweigend Fixes zurueck.

## Die drei Gates

- `npm run essential:guard` — Pflichtdateien aus `domains/shopify/essential-files.json`
  und jeder Template-Verweis muessen existieren. Greift auch bei einem frisch
  angelegten Theme, weil er das Repository prueft und nicht das Theme.
- `npm run unmerged:guard` — blockiert Deploys aus einem ungemergten Branch.
- Pre-Commit-Hook — warnt ab 7 Tagen, blockiert ab 30 Tagen auf ungemergtem Branch.
