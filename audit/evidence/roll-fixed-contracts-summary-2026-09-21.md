# S07 – PR-023b.2 PVC- und Stückverträge

Stand: 21.09.2026. Phase 1, ausschließlich lokale Analyse. 30 Integrationsfälle, 26 abgefangene Requests; neun Themequellen hashgleich mit dem historischen Live-Snapshot. Kein aktueller Live-Nachweis, keine Shopänderung.

## Ergebnis

**TP-009/P2 lokal bestätigt:** Mehrere Rollenbreiten mit Meterbezeichnungen fallen auf die erste belegte Breite zurück. Die gewählte Varianten-ID bleibt richtig, die berechnete Fläche/Menge und die Property Rollenbreite können falsch sein. Historische PVC-Referenz: Terracora Eiche Braun, `marano-eiche-braun-vinylboden-von-der-rolle`; `GOOGLE_ROLLENWARE_EXCLUSION_LIST.csv:84` nennt „2,00 m | 4,00 m“. Der aktuelle Options-/Metafeldvertrag dieses Produkts ist nicht frisch gelesen; keine heutige Fehlabrechnung behauptet.

| Fall | Soll nach gewählter Variante | Originalcode / abgefangener Payload |
| --- | --- | --- |
| 2,00 m, 201 cm Länge | 5 volle m² | 5, korrekt |
| 4,00 m, 201 cm Länge | 9 volle m² | 5; Property Rollenbreite 200 cm |
| 4,00 m, 250 cm Länge | 10 m² | 5; mit synthetischen 27,90 €/m² 139,50 statt 279,00 € |
| Umgekehrte Reihenfolge 4/2 m, zweite Variante, 250 cm | 5 m² | 10; Property Rollenbreite 400 cm |
| Einzelne 4-m-Variante | 10 m² | 10, Fallback korrekt |
| Optionen 200/400 cm | 5/9 bzw. 10 m² | korrekte Breiten, Varianten und Mengen |
| Ausgewählte Variante nicht verfügbar / Länge leer | kein Request | beide gesperrt |

10 PVC-Fälle, acht Requests. `findWidthOption` erkennt nur cm oder Wunschmaß. Bei `wIdx=-1` verwendet die Initialisierung genau den ersten Liquid-Fallback; `selectedWidth` und `syncArtUi` korrigieren ihn nicht zur gewählten Variante. `findVariant` berücksichtigt aber deren Optionen und liefert die gewählte ID. Preisbox und Payload stimmen intern überein, beruhen jedoch auf der falschen Breite. Kein Serverpreis manipuliert, kein Cart-Response geprüft.

20 Stück-/Zubehörfälle, 18 Requests: Feldwin 12/2,5 → fünf Stangen; Skarven 10,3/5,15 → zwei; Cortessa 7,2/2,4 → drei. Profile 270 cm und nach Formular-ID-Wechsel 100 cm: Bedarf 5 m → zwei bzw. fünf Profile. Weitere Pfade: Meteroption mit Komma, Bandrolle, lfm-Unterlage, m²-Ware, Rolle/Faltplatte mit Fläche, 50 m × 100 cm, Set 125 qm und vorbereitete Reichweite. Original-Liquid → Original-Mengenhilfe → dasselbe Mengenfeld → vollständiges Original-Standardformular plus `fetchConfig` → richtige ID und ganze Menge. Manuelle Stückmengen ohne belegte Reichweite bleiben erhalten. Widersprüchliche Rollenangabe erzeugt absichtlich keine Hilfe. Deaktivierter Button und als negativ vorgegebene Maximalmengenprüfung blockieren den Submit. Kein weiterer bestätigter Fehler.

## Quellen und Adaptergrenzen

- Alle IDs und Preise synthetisch. PVC 2490/2790 Cent je m², Stückvarianten 1295/1695 Cent. Keine aktuellen Verkaufspreise aus älteren Berichten abgeleitet. Rollenmetafeldzuordnung 2/4 m modelliert; historische Liste belegt nur Optionsbezeichnungen/Breiten. Leistenlängen direkt aus `domains/shopify/leisten-stangenlaenge/stangenlaenge.json` gelesen.
- Optionale `bandlaenge`/`reichweite_m2` nur vorbereitete Testdaten; keine Aussage, dass die Metafelder heute befüllt sind. Titel-/Einheitenregeln in `domains/shopify/rechner-zuordnung.md` und Originalblock dokumentiert. Ambivalente Verbrauchsdaten nicht geraten.
- Rollen-Liquid-Datenvertrag, originale Initialisierung, `syncArtUi`, Auswahl-/Rechen-/Submitfunktionen und vollständiges Art-Asset. Zeichnung, Service-UI, Layout, Lebenszyklus und echte Pickerereignisse nicht geprüft. Variantenwahl im isolierten URL-Zustand.
- Mengenhilfeblock vollständig mit LiquidJS gerendert; nur doc/schema/stylesheet beim Lesen entfernt. Vollständige JS-Klasse und Produktform-Klasse ausgeführt, Import-Bindings durch Adapter ersetzt; originale `fetchConfig` ausgeführt. FormData modelliert erfolgreiche ID-/Mengenfelder. Native Zahlenvalidierung, Section-Morph, dynamische Formulare und echter Selector-Lifecycle offen.
- Standardform-Antwort absichtlich ausstehend: geprüft ist ausschließlich der erste Request. Maximalmengenprüfung liefert einen vorgegebenen Guard-Rückgabewert; ihre Berechnung wurde nicht getestet. Keine Serverannahme, Rabatt-/Cart-Preisansicht, Drawer-/Checkout-QA.
- S01–S06-Scripts und Evidence unverändert. Keine alten Grenzraster erneut gerechnet.

## Tests und Übergabe

`node --check audit/scripts/reproduce-roll-fixed-contracts.mjs`; erster Diagnoselauf PASS. Zweiter Lauf nach Aufnahme der originalen `syncArtUi`-Funktion und zusätzlicher Rollenbreiten-Propertyassertion ebenfalls PASS. Ausgabe: `roll-fixed-contracts-2026-09-21.json`. PASS bedeutet erfolgreiche Diagnose einschließlich TP-009, keinen reparierten Fehler.

`node --test --test-concurrency=1 qa/tests/zubehoer-menge.test.mjs`: 7/7 PASS, keine Wiederholung alter Auditsuiten. Log: `roll-fixed-unit-tests-2026-09-21.log`. Dokument-/Quellenintegrität und Secret-Scan in separaten S07-Protokollen.

Nächster Schritt **CART-002a**: Gruppen-/Mengen-/Entfernungslogik aus Originalquellen und vorhandenen `cart-gruppen`, `cart-mengensperre`, `cart-waisen`, `zuschnitt-abgleich`-Tests sequenziell prüfen. Reale Drawer-/Cart-/Checkoutbedienung bleibt separat nachzuholen. Preisdiagnosen ohne Quellenänderung nicht erneut ausführen. H-011 um aktuelle PVC-Optionen, Variantenbreiten und betroffene Produkte erweitern.
