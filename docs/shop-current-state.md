# Shop: aktueller Stand

Nur was jetzt gilt. Historie steht in git, Entscheidungen in `shop-decisions.md`.

## Architektur (relevant fuer die laufenden Pakete)
- **Teppich nach Mass**: Template `templates/product.einfassung.json`, Block
  `blocks/tp-einfass-konfigurator.liquid`, UI-Skript `assets/tp-einfass-konfigurator.js`,
  Rechenkern `assets/tp-masstepich-rechnung.js` (Flaeche, Umfang, Mindestpreis, Kettelung
  als eigene Warenkorbzeile). Produkte: Handles `*-teppich-nach-mass`.
- **Teppichboden/Rollenware**: `blocks/tp-rollware-rechner.liquid`, eigene Logik, EUR/m2.
  Vom Teppich-Projekt nicht betroffen.
- Weitere Rechner ohne Aufschluesselung: `blocks/paket-auswahl.liquid`, `blocks/tp-teppich-wunschmass.liquid`.
- Theme-IDs: nur `domains/shopify/live-theme.json`.

## Regeln
- Ab-Preis Teppiche: einzige Quelle `snippets/tp-teppich-ab-preis.liquid` (80 x 150 cm, Kettelservice-Handle `kettelservice`, Mindestpreis `service.mindestpreis` = 99 EUR bei allen 33 Produkten). `qa/tests/tp-teppich-ab-preis.test.mjs` haelt Liquid und Rechenkern deckungsgleich. Erkennung Teppich: `custom.preis_pro_001_qm = true` UND `service.einfassung` gesetzt - zentimetergenaue Rollenware traegt `preis_pro_001_qm` ebenfalls und bleibt bei EUR/m2. Karte nimmt die guenstigste Farbe, die PDP (`blocks/price_custom.liquid`) die gewaehlte Variante.
- Raumansicht ist ein Block-Schalter `raumansicht_aktiv` (Standard aus). Code, Foto-Settings
  und Massstab bleiben erhalten; ohne Raumliste faellt das Skript auf die Masszeichnung zurueck.
- Kundenansicht des Konfigurators: Endpreis plus zwei Hinweise (Rund/Oval-Rechteck, Mindestpreis). Keine Aufschluesselung.
- Testen ohne Evidence: `npm run workflow:scratch -- --theme-id <unpublished>`; development-Themes
  werden abgelehnt. Genutzt: Theme "test-seo-titel-2026-09-15". Dessen Einstellungen weichen von
  Live ab - Layoutfehler dort erst gegen Live gegenpruefen, bevor sie als Shop-Fehler gelten.

## Aktive Arbeit
- keine. S-04/S-05/S-07/S-17 sind seit 2026-09-20 live (PR #391). S-06 im PR. Danach: S-09 (Aktionshinweis an Verlegeservice-Bloecke), S-12, S-13.

## Offene Blocker
- S-10: keine Einkaufspreise in Shopify; EK-Quelle von Ahmet noetig.
- Codex-Review am 2026-09-20 am Nutzungslimit; PRs #388/#391 gingen mit eigener Pruefung und vollem Preview-Gate live.

## Fakten
- Preise wie "0,92 EUR" im PDP-DOM sind unsichtbare Elemente, kein Kundenbefund.
- `snippets/tp-preisangabe.liquid` wird in `blocks/_product-details.liquid` gerendert, nie als Kind des Produktrasters.
- Browser-Pruefung: das Preview-Cookie haelt; Live nur mit `?preview_theme_id=` (leer) ansehen und `Shopify.theme.role` gegenlesen.
- S-01/S-02 sind seit 2026-09-20 live (PR #388). Deploy-Befehle brauchen `--p0 0 --p1 0`.
- `qa/evidence/local-verification.json` wird von Validierungslaeufen neu geschrieben und blockiert dann `git pull --rebase`; nach einem Deploy mitcommitten.
- Codex-Review war am 2026-09-20 am Nutzungslimit; PR #388 ging mit eigener Pruefung + vollem Preview-Gate live.
