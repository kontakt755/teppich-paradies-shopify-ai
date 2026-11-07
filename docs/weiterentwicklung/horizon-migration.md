# Horizon-Migration (Backlog)

Die Migration auf eine neuere Horizon-Version läuft nur auf ausdrücklichen Auftrag
(`AGENTS.md`, „NIEMALS ohne ausdrückliche Freigabe“ und Backlog). Hier sammeln sich die
Punkte im unveränderten Horizon-Kern, die bewusst bis dahin warten.

| Punkt | Dateien | Befund | Entscheidung |
|---|---|---|---|
| Vorschaubilder der Produktgalerie tragen `aria-selected` an Knöpfen | `snippets/slideshow-controls.liquid` (Z. ~117, ~170), `assets/slideshow.js` (Z. ~428), CSS-Selektoren auf `[aria-selected]` | axe meldet `aria-allowed-attr` und `scrollable-region-focusable`; die Knöpfe sind per Tab bedienbar | Inhaber 07.11.2026 (Werkbank w-312): mit der Migration erledigen, dann auf `aria-current` umstellen (Liquid, JS und CSS zusammen) und mit axe auf drei Produktseiten prüfen |
