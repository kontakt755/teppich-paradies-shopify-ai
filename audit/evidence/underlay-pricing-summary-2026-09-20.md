# PR-022 – Haftunterlage und kombinierter Payload

20.09.2026, S04. **Lokal abgeschlossen, keine Live-Abnahme.** 61 Integrationsfälle, 54 vollständig abgefangene Requests, sieben blockierte Hauptkonfigurationen. 198.468 unabhängige Auswahl-/Grenzvergleiche ohne Abweichung von der implementierten Bahnenregel. Kein neuer bestätigter Fehler, keine Reparatur.

Script: `audit/scripts/reproduce-underlay-pricing.mjs`. Vollständige Daten: `underlay-pricing-2026-09-20.json`.

## Quellen und Regeln

`templates/product.rolle.json` konfiguriert `antirutsch-unterlage-fuer-teppiche-rollenware`. Der originale Liquid-Datenvertrag liefert nur verfügbare Varianten mit positivem Preis; JS liest die Breite aus einem Titel wie `1 mm, 180 cm breit (je lfm)`. Titel ohne erkannte Breite fallen weg. Zusatzprodukte sind nur bei exakter Hauptvariantenfreigabe `service.einfassen = Verfügbar` erlaubt.

Für jede Unterlagenbreite berechnet der Originalcode:

- Anzahl gleich breiter Bahnen, die zusammen die Teppichbreite abdecken;
- jede Bahn über die volle Teppichlänge, auf ganze laufende Meter aufgerundet;
- Gesamtmenge × Variantenpreis je laufendem Meter;
- Auswahl der günstigsten einzelnen Variante unter diesen Kandidaten.

Der unabhängige Prüfwert nutzt ganzzahlige cm-/Cent-Arithmetik. Alle Raummaßbreiten 50–495 cm plus 500 cm Meterware, 148 Längen direkt vor/auf/nach vollen Metergrenzen von 100 bis 5.000 cm und drei synthetische Kataloge: 447 × 148 × 3 = 198.468 Vergleiche. Diese Zahl belegt den Rechenumfang, keine Anzahl geprüfter Kundenprodukte.

## Lokale Beispiele

Synthetischer Basiskatalog: 80 cm/935 Cent, 120 cm/1.400 Cent, 180 cm/1.900 Cent, 200 cm/2.400 Cent je lfm.

| Fall | Unterlagenmenge | Unterlagenpreis | Summe mit Hauptware/Zubehör |
| --- | --- | ---: | ---: |
| Meterware 400 × 200 cm | 5 Bahnen, 80 cm, 10 lfm | 93,50 € | 620,70 € |
| Dazu gültige Fußleiste 12 m zu Testpreis 10,95 €/m | wie oben | 93,50 € | 752,10 €, drei Positionen |
| Meterware 400 × 201 cm | 5 Bahnen, 80 cm, 15 lfm | 140,25 € | 733,35 € |
| Anderer Testkatalog: 80 cm/10 €/m, 200 cm/21 €/m; 400 × 200 cm | 2 Bahnen, 200 cm, 4 lfm | 84,00 € | 611,20 € |

Der letzte Fall beweist, dass der niedrigste Meterpreis nicht blind gewinnt: zehn Meter der 80-cm-Variante wären mit 100 € teurer. Preisbox, Zusatzzeilen, tatsächliche Payloadmengen und daraus berechnete Cent-Gesamtsumme stimmen überein. Gemeinsam bestellte Positionen tragen dieselbe `_Gruppe`; die `cart:update`-Menge ist die Summe aller Positionsmengen. Ein direkter zweiter Submit während des laufenden Aufrufs bleibt ohne weiteren Request.

Nicht verfügbare bzw. 0-/negativ bepreiste Varianten, unbekannte Breitentitel, fehlende Freigabe, abgewählte Unterlage, ungültige Hauptmaße, cmExact-Hauptware und gültige individuell bemessene Fußleiste sind enthalten. Echte Picker-/Farb-/Artwechsel und Cart-UI wurden damit nicht getestet.

## Preis- und Beleggrenzen

Die historische Runtime-Datei zeigt bei 400 × 200 cm den Hinweis „80 cm breit · 5 Bahnen = 10 lfm“ sowie „ab 9,35 € / m“. Sie belegt weder die konkrete Zuordnung dieses Mindestpreises zur 80-cm-Variante noch den vollständigen Unterlagenkatalog. Alle IDs und Breiten-/Preispaare im neuen Script sind daher ausdrücklich synthetisch. Die 620,70/752,10 € sind lokale Kontrollsummen, keine bestätigten heutigen Shoppreise.

Der Adapter rendert ursprüngliche Liquid-Zuweisungen/JSON mit dem echten Farbsnippet und führt ursprüngliche Rechen-/Submitfunktionen aus. Layout, Zeichnung, Section-Lifecycle, Service-UI und Meterware-Tipp sind ausgelassen; der Hauptvariantenzustand wird isoliert vorgegeben. Kein neuer Shopify-Request, keine tatsächliche Serverantwort, keine Benachrichtigung oder Checkoutprüfung. Vier Themequellen stimmen per SHA-256 mit dem historischen Live-Snapshot überein.

## H-008 – anderer Verlegeplan ist eine offene Fachfrage

Im synthetischen Basiskatalog kosten gleichgerichtete Bahnen bei 400 × 201 cm 140,25 €. Gedrehte Verlegung könnte rechnerisch acht Meter der 120-cm-Variante für 112,00 € nutzen. In einem synthetischen Zweibreitenkatalog kostet eine einheitliche Breite für 200 × 300 cm 84,00 €; gemischt 80 + 120 cm wären es rechnerisch 70,05 €.

Der vorhandene Code verspricht die günstigste Variante innerhalb seiner festen Bahnenregel. Ob gedrehte oder gemischte Bahnen, andere Stückelungen oder eine andere Meter-Aufrundung tatsächlich lieferbar und fachlich zulässig sind, ist nicht belegt. Deshalb kein zusätzliches Preisissue und keine Empfehlung zur automatischen Umstellung. Aktuelle Produktdaten und Zuschnittregeln zunächst rein lesend nachweisen.

## Fortsetzung

Nächster Bereich: **PR-023a**, separater Wunschmaßpfad `product.teppich.json` → `tp-teppich-wunschmass.liquid`. PR-001–011 und lokale PR-020–022 ohne Quellenänderung nicht wiederholen. H-008 bei verfügbarer Live-Verbindung ergänzen. Gesamt-Audit bleibt WORKING.
