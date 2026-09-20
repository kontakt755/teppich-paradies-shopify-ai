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
- Ab-Preis Teppiche: einzige Quelle `snippets/tp-teppich-ab-preis.liquid` (80 x 150 cm, Kettelservice-Handle `kettelservice`, Mindestpreis `service.mindestpreis` = 99 EUR bei allen 33 Produkten). `qa/tests/tp-teppich-ab-preis.test.mjs` haelt Liquid und Rechenkern deckungsgleich. Erkennung Teppich: `custom.preis_pro_001_qm = true`; Teppichboden laeuft ueber `custom.rollenbreite` und ist unberuehrt.
- Raumansicht ist ein Block-Schalter `raumansicht_aktiv` (Standard aus). Code, Foto-Settings
  und Massstab bleiben erhalten; ohne Raumliste faellt das Skript auf die Masszeichnung zurueck.
- Kundenansicht des Konfigurators: Endpreis plus zwei Hinweise (Rund/Oval-Rechteck, Mindestpreis). Keine Aufschluesselung.
- Testen ohne Evidence: `npm run workflow:scratch -- --theme-id <unpublished>`; development-Themes
  werden abgelehnt. Genutzt: Theme "test-seo-titel-2026-09-15". Dessen Einstellungen weichen von
  Live ab - Layoutfehler dort erst gegen Live gegenpruefen, bevor sie als Shop-Fehler gelten.

## Aktive Arbeit
- S-04: PR offen. Deploy erst zusammen mit S-07 (PDP), damit Karte und Produktseite denselben Preis nennen.

## Offene Blocker
- keine

## Fakten
- PDP der Teppiche zeigt noch "XX EUR/m2" (nicht ueber `blocks/price.liquid`-Zweig) - S-07. Auf der PDP tauchten im DOM Preise wie "0,92 EUR" auf (Empfehlungen/Sticky?) - in S-07 pruefen.
- S-01/S-02 sind seit 2026-09-20 live (PR #388). Deploy-Befehle brauchen `--p0 0 --p1 0`.
- `qa/evidence/local-verification.json` wird von Validierungslaeufen neu geschrieben und blockiert dann `git pull --rebase`; nach einem Deploy mitcommitten.
- Codex-Review war am 2026-09-20 am Nutzungslimit; PR #388 ging mit eigener Pruefung + vollem Preview-Gate live.
