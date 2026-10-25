# Theme-Einstellungen gehen beim Theme-Wechsel verloren

**Regel:** Vor jedem Livegang muessen die Theme-Einstellungen
(`config/settings_data.json`) von Live- und Preview-Theme gleich sein.
`npm run workflow:doctor` prueft das und meldet Abweichungen; angeglichen wird
nie automatisch.

## Warum das passieren kann

Die Deploy-Kette veroeffentlicht abwechselnd zwei Themes: `workflow:preview`
pusht `main` in das Preview-Theme, `workflow:live` macht genau dieses Theme zum
Live-Theme, das bisherige Live-Theme wird zum naechsten Preview-Theme.

`config/settings_data.json` gehoert dabei nicht zum Push (`--ignore`): die
Datei liegt auf dem Theme und wird im Admin gepflegt (Theme-Editor,
App-Einbettungen, Farben, Kopf- und Fusszeilen-Einstellungen). Das Gate
`PREVIEW_SETTINGS_DRIFT` vergleicht nur die Preview mit sich selbst zwischen
`workflow preview` und `workflow live` desselben Deploys - nicht Live gegen
Preview.

Folge: Stellt jemand im Admin etwas am **Live**-Theme ein, steht diese
Einstellung nur dort. Beim naechsten Livegang wird das andere Theme
veroeffentlicht, und die Einstellung ist auf der Seite weg, ohne Fehlermeldung.

## Was passierte

Bis 2026-10-24 war es Glueck: Beide Dateien hatten dieselbe Pruefsumme (Stand
15.09.), es ging nichts verloren. Aufgefallen ist die Luecke in der
Shopanalyse vom 24.10., als ein toter App-Eintrag nur in einem der beiden
Themes bereinigt werden sollte - er waere beim naechsten Wechsel
zurueckgekommen.

## Was tun, wenn der Doctor abweicht

1. Abweichende Schluessel stehen in der Meldung. Beide Dateien holen und
   vergleichen:
   `shopify theme pull --theme <ID> --only config/settings_data.json --path <ordner>`
   (IDs aus `domains/shopify/live-theme.json`).
2. Klaeren, welche Fassung gilt. Gewollte Admin-Aenderungen am Live-Theme
   gehoeren auch ins Preview-Theme - **im Admin** (Theme-Editor des
   Preview-Themes) oder nach Freigabe per gezieltem Push nur dieser Datei.
   Der Grundsatz „nie von Hand ins Preview-Theme pushen“ gilt fuer
   Theme-Code; `settings_data.json` pusht die Kette nie, deshalb braucht ein
   Abgleich dieser einen Datei eine bewusste Entscheidung statt eines Gates.
3. Danach `workflow:doctor` erneut: die Zeile muss OK zeigen.

Verwandt: `docs/lessons/theme-id-drift.md` (welches Theme ist live).
