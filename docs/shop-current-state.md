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
- Raumansicht ist ein Block-Schalter `raumansicht_aktiv` (Standard aus). Code, Foto-Settings
  und Massstab bleiben erhalten; ohne Raumliste faellt das Skript auf die Masszeichnung zurueck.
- Kundenansicht des Konfigurators: Endpreis plus zwei Hinweise (Rund/Oval-Rechteck, Mindestpreis). Keine Aufschluesselung.
- Testen ohne Evidence: `npm run workflow:scratch -- --theme-id <unpublished>`; development-Themes
  werden abgelehnt. Genutzt: Theme "test-seo-titel-2026-09-15". Dessen Einstellungen weichen von
  Live ab - Layoutfehler dort erst gegen Live gegenpruefen, bevor sie als Shop-Fehler gelten.

## Aktive Arbeit
- keine. Naechstes Paket: S-04 (Rechenregel Ab-Preis).

## Offene Blocker
- keine

## Fakten
- Karten der Teppiche zeigen heute "ab XX EUR/m2", die PDP "XX EUR/m2" - Gegenstand von S-04 bis S-07.
- S-01/S-02 sind seit 2026-09-20 live (PR #388). Deploy-Befehle brauchen `--p0 0 --p1 0`.
- `qa/evidence/local-verification.json` wird von Validierungslaeufen neu geschrieben und blockiert dann `git pull --rebase`; nach einem Deploy mitcommitten.
- Codex-Review war am 2026-09-20 am Nutzungslimit; PR #388 ging mit eigener Pruefung + vollem Preview-Gate live.
