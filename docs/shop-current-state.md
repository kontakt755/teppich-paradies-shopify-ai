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
- Teppich-Sachdaten kommen vom Teppichboden: `snippets/tp-teppich-max-breite.liquid` (groesste verfuegbare `custom.rollenbreite`, optional je Farbe ueber option1, Cover minus 10 cm, Rueckfall `service.max_breite_cm`) und `snippets/tp-teppich-qualitaet.liquid` (Fasermaterial · Art · Florhoehe). Der Konfigurator bekommt die Breite je Variante (`max_breite_cm` im Varianten-JSON) und setzt `maxW` in `rechnen()` neu. Der Rechner dreht den Teppich: nur die KURZE Seite muss in die Rolle passen.
- Aktion: `snippets/tp-aktion-aktiv.liquid` (Metafelder `aktion.start/ende`). Verlegeservice-Berechtigung: `snippets/tp-vs-berechtigt.liquid` (Template `rolle` + Produkttyp aus `tp_vs_produkttypen`). Trifft beides zu, zeigt `blocks/tp-verlegeservice-hinweis.liquid` den Aktionshinweis statt des Kostenlos-Versprechens. Der Service wird per Anfrage gebucht - es gibt keine Warenkorb-Logik, die zu sperren waere.
- Streichpreis und Sale-Badge erscheinen NUR bei aktiver Aktion: 7 Dateien (Karten-Badge, `price.liquid`, `price_custom`, `tp-price-per-sqm`, `card-gallery`, Warenkorb, Schnellbestellliste) fragen `tp-aktion-aktiv`. `qa/tests/tp-streichpreis-nur-bei-aktion.test.mjs` laesst jede neue Datei durchfallen, die `compare_at_price` liest, ohne das Snippet zu fragen. Wer im Admin nur einen Vergleichspreis eintraegt, sieht im Shop NICHTS - das ist Absicht.
- Eine Aktion starten: compare_at_price (nur belegter Referenzpreis) + `aktion.start` am Produkt setzen. Beenden: `aktion.ende` setzen und compare_at_price entfernen.
- Ab-Preis Teppiche: einzige Quelle `snippets/tp-teppich-ab-preis.liquid` (80 x 150 cm, Kettelservice-Handle `kettelservice`, Mindestpreis `service.mindestpreis` = 99 EUR bei allen 33 Produkten). `qa/tests/tp-teppich-ab-preis.test.mjs` haelt Liquid und Rechenkern deckungsgleich. Erkennung Teppich: `custom.preis_pro_001_qm = true` UND `service.einfassung` gesetzt - zentimetergenaue Rollenware traegt `preis_pro_001_qm` ebenfalls und bleibt bei EUR/m2. Karte nimmt die guenstigste Farbe, die PDP (`blocks/price_custom.liquid`) die gewaehlte Variante.
- Raumansicht ist ein Block-Schalter `raumansicht_aktiv` (Standard aus). Code, Foto-Settings
  und Massstab bleiben erhalten; ohne Raumliste faellt das Skript auf die Masszeichnung zurueck.
- Kundenansicht des Konfigurators: Endpreis plus zwei Hinweise (Rund/Oval-Rechteck, Mindestpreis). Keine Aufschluesselung.
- Testen ohne Evidence: `npm run workflow:scratch -- --theme-id <unpublished>`; development-Themes
  werden abgelehnt. Genutzt: Theme "test-seo-titel-2026-09-15". Dessen Einstellungen weichen von
  Live ab - Layoutfehler dort erst gegen Live gegenpruefen, bevor sie als Shop-Fehler gelten.

## Aktive Arbeit
- keine. S-04/S-05/S-07/S-17 sind seit 2026-09-20 live (PR #391). S-06, S-19, S-20, S-21 bis S-24 live. Naechste Pakete (alt, siehe Backlog): S-09 (Aktionshinweis an Verlegeservice-Bloecke), S-12 (Herkunft der 5 Streichpreise), S-11 nachziehen, S-14.

## Offene Blocker
- S-10: keine Einkaufspreise in Shopify; Ahmet reicht eine EK-Liste nach (offen, kein Termin). Nicht erneut nachfragen, nur im Statusbericht als offen fuehren.
- Codex: mittags am Nutzungslimit, abends Nachcheck des ganzen Tages-Diffs gelaufen (5 Defekte behoben, siehe shop-tests). `codex exec` immer mit `< /dev/null` starten, sonst haengt es im Hintergrund.

## Fakten
- Manuell kuratierte Kollektionen (seit 2026-09-20): `teppiche`, `teppichboden-hochflor`, `-wolle`, `-velours`, `-schlinge`, `-nadelvlies`; `teppichboden` war es schon. Regel und Baender stehen im Backlog (S-11, S-26). Nach jedem Produktimport neu anwenden - Shopify sortiert dort nichts mehr selbst ein.
- Metaobjekte vom Typ `fasermaterial` koennen auf Entwurf stehen und sind dann im Shop unsichtbar (2026-09-20: Schurwolle, Polypropylen, Sisal aktiviert). Bei fehlendem Material zuerst den Status pruefen.
- Screenshots im eingebauten Browser bleiben nach Scroll-Skripten oft leer - dann vermessen statt raten.
- Materialdaten der Teppiche liegen am Basis-Teppichboden: `product.metafields.service.einfass_basis.value` -> `custom.fasermaterial` (Metaobjekt-Liste), `custom.arten`, `custom.florhohe`, `custom.ruckenausstattung`. Die Teppiche selbst tragen nur `service.*`.
- Die 49 Teppich-Beschreibungen und ihre Meta-Descriptions nennen seit 2026-09-20 keinen m2-Preis und keinen Kettelpreis mehr (Abschnitt "So bestellen Sie"). Originale: lokal `~/teppich-paradies-analyse/sicherungen/teppich-texte-2026-09-20.json` (nicht im Repo). Die Masse im Text sind beim Schreiben vom Teppichboden abgeleitet, aber STATISCH - aendert sich eine Rollenbreite, zeigen Karte und Konfigurator sofort den neuen Wert, der Beschreibungstext nicht.
- Im Shop gibt es seit 2026-09-20 keinen aktiven Streichpreis mehr. Neue Streichpreise nur mit belegtem Referenzpreis (S-12).
- Preise wie "0,92 EUR" im PDP-DOM sind unsichtbare Elemente, kein Kundenbefund.
- `snippets/tp-preisangabe.liquid` wird in `blocks/_product-details.liquid` gerendert, nie als Kind des Produktrasters.
- Browser-Pruefung: das Preview-Cookie haelt; Live nur mit `?preview_theme_id=` (leer) ansehen und `Shopify.theme.role` gegenlesen.
- S-01/S-02 sind seit 2026-09-20 live (PR #388). Deploy-Befehle brauchen `--p0 0 --p1 0`.
- `qa/evidence/local-verification.json` wird von Validierungslaeufen neu geschrieben und blockiert dann `git pull --rebase`; nach einem Deploy mitcommitten.
- Codex-Review war am 2026-09-20 am Nutzungslimit; PR #388 ging mit eigener Pruefung + vollem Preview-Gate live.
