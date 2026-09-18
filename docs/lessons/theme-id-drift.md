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

## Warum die Regel so lautet

- Die stillgelegte ID steht jetzt unter `retired` in `live-theme.json` —
  bewusst nicht in `CLAUDE.md`, weil `theme:guard` dort jede ID als Fehler wertet.
- `live-theme.json` traegt `verifiedAt`. Ein Stand ohne Datum ist kein Stand.
- Nachpruefen ueber den Shopify-MCP, live ist der Knoten mit `role: MAIN`:

```graphql
query { themes(first: 20) { nodes { id name role updatedAt } } }
```

Danach `live-theme.json` aktualisieren (inklusive `verifiedAt`), das alte Theme
unter `retired` eintragen und `npm run theme:guard` laufen lassen.
