# Theme-ID in Prosa veraltet, ohne dass es jemand merkt

**Regel:** Die einzige Quelle fuer Theme-IDs ist `domains/shopify/live-theme.json`;
`npm run theme:guard` verbietet IDs in Anweisungsdateien.

## Was passierte

Bis 2026-09-03 nannten `CLAUDE.md`, `AGENTS.md` und die Roadmap
`theme-productpage-v2-night` als Live-Theme. Dieses Theme existierte in der
Admin API da schon nicht mehr. Agenten haben die ID trotzdem weiter als
gesicherten Stand weitergegeben — eine Zahl in Prosa liest sich wie ein Fakt,
und niemand prueft einen Fakt nach, der in drei Dateien gleich steht.

Dasselbe Muster ein zweites Mal mit dem Fallback-Theme: Die alte Fallback-ID
stand als Zahl in `AGENTS.md`, veraltete still, und das Theme wurde am
2026-09-15 unbemerkt geloescht. Gemerkt hat es erst die Bestandspruefung im
Deploy-Preflight.

Ein drittes Mal am 2026-10-12, diesmal mit Ansage: Ein Mensch sollte 44 alte
Entwicklungs-Themes loeschen. Der Shopify-Admin (Onlineshop → Themes) zeigt
Entwicklungs-Themes aber gar nicht an — sichtbar waren nur Live, Vorschau,
Fallback, Arbeitstheme und ein Testtheme. Geloescht wurden das Fallback und das
Testtheme, alle 50 Entwicklungs-Themes blieben stehen. Ersatz per
`themeDuplicate` des Live-Themes, siehe `retired` in `live-theme.json`.
Folgerung: **Aufraeumauftraege fuer Themes nie als „im Admin loeschen“
formulieren.** Entwicklungs-Themes verschwinden mit `shopify theme delete
--development` auf dem Rechner, der sie angelegt hat, oder bleiben stehen —
sie zaehlen nicht zum Limit von 20 Themes und stoeren den Shop nicht.

## Warum die Regel so lautet

- Die stillgelegte ID steht jetzt unter `retired` in `live-theme.json` —
  bewusst nicht in `CLAUDE.md`, weil `theme:guard` dort jede ID als Fehler wertet.
- `live-theme.json` traegt `verifiedAt`. Ein Stand ohne Datum ist kein Stand.
- Nachpruefen ueber den Shopify-MCP, live ist der Knoten mit `role: MAIN`:

```
npm run -s kurz -- themes-query   # nur MAIN + preview/fallback/arbeit, nicht themes(first: 20)
```

Danach `live-theme.json` aktualisieren (inklusive `verifiedAt`), das alte Theme
unter `retired` eintragen und `npm run theme:guard` laufen lassen.
