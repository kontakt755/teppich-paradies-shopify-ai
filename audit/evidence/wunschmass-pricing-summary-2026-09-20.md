# PR-023a – separater Teppich-Wunschmaßpfad

Lokaler Diagnosebericht, 20.09.2026. Keine Shopänderung, kein Netzwerk und kein echter Cart. Reproduktion: `node audit/scripts/reproduce-wunschmass-pricing.mjs`; 46 Fälle, 31 abgefangene Requests. PASS bezeichnet die ausgeführte Diagnose, keine behobenen Fehler.

## Produktvertrag und Reichweite

`domains/shopify/rechner-zuordnung.md` berichtet für den 09.09. über 401 aktive Produkte: keines verwendet `product.teppich.json`. Der Service-Handoff vom 11.09. bestätigt den ruhenden Wunschmaßpfad. Das sind datierte Repository-Berichte, kein neuer Admin-Snapshot. Heutige Zuordnung bleibt H-009. Kein Lösch-/Cleanup-Auftrag.

Das Template bindet `tp-teppich-wunschmass` ein. Der Block rendert nur bei positiver `custom.wunschmass_mindestbreite_cm`. Preisvertrag laut Block: Shopify-Einheit immer 0,01 m², echte Kreis-/Ellipsenfläche, Aufrundung der Flächeneinheiten, Fertigungszuschlag auf ganze Preiseinheiten, Mindestpreis über die Gesamtsumme. Kein separater Kettelservice in diesem Pfad. `buy-buttons` und der Options-Price-Calculator-Appblock sind im heutigen Repository-Template **disabled**; der CSS-only-Befund aus dem alten Review vom 08.09. ist hierfür überholt.

Alle neuen Produktdaten und Preise sind synthetisch. Die 89 Cent je Einheit sind ein Rechenfixture, keine Behauptung eines aktiven Teppichprodukts. Block und Template sind SHA-256-identisch zum historischen Theme-Snapshot vom 19.09.; heute kein MAIN-/Produktabgleich.

## Ergebnisse

| Fall | Menge und rechnerische Summe im Fixture | Ergebnis |
| --- | --- | --- |
| Rechteck 200 × 300 cm | 600 × 89 Cent = 534,00 € | PASS lokal |
| Quadrat 150 cm | 225 × 89 Cent = 200,25 € | PASS lokal |
| Kreis Ø 200 cm | 315 × 89 Cent = 280,35 € | PASS lokal; echte Kreisfläche |
| Oval 200 × 300 cm | 472 × 89 Cent = 420,08 € | PASS lokal; echte Ellipsenfläche |
| Rechteck 201 × 301 cm | 606 Einheiten | PASS, Hundertstel aufrunden |
| 50 × 50 cm, Mindestpreis 99 € | 112 × 89 Cent = 99,68 € | PASS; Ganzzahleinheiten dürfen Mindestpreis überschreiten |
| 200 × 300 cm, Zuschlag 10 € | 612 × 89 Cent = 544,68 € | PASS zur dokumentierten Einheitenregel; Zuschlag wird 10,68 € |
| Fehlendes/0/negatives Aktivierungsmetafeld | Block rendert nicht | Drei Liquid-Gates bestanden |
| Ungültige/fehlende Maße, Maßgrenzen, Mindestfläche, Preis 0 | Kein Request | 13 blockierte Fälle |
| Gültiger Wechsel über bekanntes Formular-ID-Fixture | ID und Preis gemeinsam aktualisiert | PASS lokal; kein realer Variant-Picker-Test |
| Synthetische Serverablehnung | Meldung, Button wieder aktiv | PASS lokal; keine Shopify-Antwort |

Die unabhängige Mengenrechnung benutzt Ganzzahlen in Hundertstelzentimetern und für Kreis/Ellipse eine enge rationale Pi-Schranke. Es wird keine kopierte Produktformel als Erwartungswert verwendet. Anzeige-Cents werden mit Menge × Fixturepreis verglichen. 28 endliche Einzelpayloads werden zusätzlich durch die lokale Bestellmail gerendert.

## Bestätigte bedingte Codefehler

- **TP-006/P3:** Breite `200.5`, Länge `300` → berechnet 602 Einheiten/535,78 €, Properties nennen jedoch `201 cm` × `300 cm`. Die lokale Mail rekonstruiert 603 Einheiten und warnt `MENGE ZU KLEIN` / `NICHT ZUSCHNEIDEN`. Bei `200.4` heißt die Property stattdessen `200 cm`; der eingegebene Zuschnitt wird in beiden Fällen nicht unverändert übermittelt. Quadrat 150,5 cm hat ebenfalls eine falsche Mailwarnung. Kreis/Oval verlieren ebenfalls die Dezimalmaße, lösen in diesen Beispielen durch die Mailtoleranz aber keine Warnung aus. Native Komma-/Paste-/step-Behandlung ist nicht durch den DOM-Adapter belegt.
- **TP-007/P3:** Normaler direkter zweiter Klick wird durch `disabled` abgefangen. Während der erste Request wartet, Eingabe von 200 auf 201 cm ändern → `render()` aktiviert den Button → zweiter Klick erzeugt einen weiteren Request (600 und 603 Einheiten). Keine Behauptung zweier angenommener Live-Bestellungen; beide Requests abgefangen.

## Offene Integrationsproben, keine weiteren bestätigten Shopissues

Ohne Maximalgrenzen kann der Adapter mit `1e309` eine nichtendliche Menge bis zu `quantity:null` bringen. Reale `type=number`-Sanitisierung kann diesen konkreten Text verhindern. Ein fremdes globales Formular-ID-Fixture übernimmt die ID, behält aber den alten Preis. Die initiale nicht verfügbare Variante wird erst durch die simulierte Serverablehnung abgefangen. Diese isolierten Proben belegen keine tatsächlich passende Produkt-/DOM-Konstellation. H-010 hält den erforderlichen Browser-/Varianten-/Datenbeleg fest; keine aggressive Reparaturanweisung daraus.

## Grenzen

Vollständige ursprüngliche Liquid-Ausgabe und eingebettete JS-IIFE ausgeführt; nur Shopify-`doc`/`schema` beim Einlesen entfernt. Minimaler DOM-Adapter mit abgefangenem `fetch`, synthetischen Antworten und simuliertem Redirect. Kein Layout-, Browser-, echter Variantenereignis-, Section-, Zurück-/Reload- oder Checkoutnachweis. LiquidJS ist nicht Shopify Liquid; lokale Mail weder versendet noch gegen Admin-Deployment geprüft. Frühere S01–S04-Tests nicht wiederholt.
