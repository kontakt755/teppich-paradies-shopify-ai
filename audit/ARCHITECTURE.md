# Architektur – bisher belegter Ausschnitt

Historische Kartierung vom 19.09. übernommen: `evidence/source-manifest.json` enthält 643 Dateien für acht Theme-Verzeichnisse; 642 waren zwischen damaligem Repository und Live-Snapshot gleich, `config/settings_data.json` abweichend. Dies ist eine historische Feststellung, keine neue Live-Synchronisierung.

Übernommener aktueller HEAD: `d63acaf`. Gegenüber `6672909` änderten sich Dashboarddaten sowie interne Bestellmail und zugehöriger Test; keine der beiden jetzt geprüften Rechnerdateien. Für diese beiden Dateien wurde zusätzlich ihr SHA-256 gegen den historischen Live-Hash geprüft: identisch.

## Preiswege

- Paketware nutzt `blocks/paket-auswahl.liquid`: HTML/CSS und eingebettetes JavaScript. Paketfläche kommt vom Produktmetafeld, Preis/ID aus der Variante; Farbwechsel führt beide über `variant:update` nach. Die tatsächliche Cart-Menge ist eine ganze Anzahl Originalpakete.
- Rollenware nutzt `blocks/tp-rollware-rechner.liquid` plus `assets/tp-rollware-art.js`. Hauptfläche, Raummaß und Zusatzprodukte werden vor einem eigenen Cart-Request berechnet. Abrechnung kann je Produkt volle m² oder 0,01-m²-Einheiten verwenden.
- `product.einfassung.json` lädt `tp-einfass-konfigurator`; dieser lädt `tp-masstepich-rechnung.js`, `tp-zuschnitt-abgleich.js`, `tp-einfass-konfigurator.js`. PR-021 hat den lokalen Datenvertrag und die Preis-/Payload-Integration geprüft; reale Produktfreigaben, Browserbedienung und nachgelagerter Cart-/Abgleich bleiben offen.
- `product.teppich.json` bindet einen anderen Block `tp-teppich-wunschmass` ein. Seine Existenz ist kein Beleg für toten Code. Produktzuordnung noch prüfen.
- Cart-Darstellung, Gruppierung und Benachrichtigungen hängen an den Mengen/Properties dieser unterschiedlichen Abrechnungssysteme. Ein ungewöhnlich hoher Mengenwert kann korrekt sein.

Die detaillierte Teilkarte steht in DEPENDENCY_MAP.md. App-Blöcke, Section-Lifecycle, globale Runtime, Navigation, ungenutzte Komponenten und sonstige Architektur sind noch offen. Keine Cleanup-Empfehlung ohne Laufzeit-/Referenzbeleg.

## Ergänzung PR-020

Die Regeln unterscheiden sich absichtlich: Rollen-/Raummaß mit aktivem Hundertstel-Flag rundet kaufmännisch, Einfassung rundet Hundertstel auf. `benachrichtigungen/README.md` und die aktuelle interne Mail-Vorlage legen diese Trennung ausdrücklich fest. Die Rechenwege dürfen deshalb nicht pauschal vereinheitlicht werden.

TP-004 liegt innerhalb der ersten Regel: `round((cm² / 10000) * 100)` unterschreitet einige exakte Halbwerte. Der Fehler steckt in zwei getrennten Mengenberechnungen des Rollenblocks sowie im Preisvergleich. Die Mail berechnet aus ursprünglichen cm-Maßen ganzzahlig und warnt dann beim regulär vom Rechner erzeugten Payload. Das ist lokal reproduziert; Shop-Datenflag und eingesetzte Mail-Vorlage sind nicht aktuell verifiziert.

`tp-rollware-art.js` und der Rollenblock sind bei PR-020 weiterhin hashgleich mit dem historischen Live-Snapshot. Es wurde kein Theme geladen oder verändert.

## Ergänzung PR-021

Der Liquid-Block lässt nur bekannte Einfassarten, positive Maßgrenzen, `preis_pro_001_qm=true` und Varianten mit exakter Servicefreigabe/positivem Preis zu. Formen kommen aus dem Produktmetafeld; historisch war Piumera nur für Rechteck freigegeben. Andere Formen/Arten im neuen Report sind synthetische Fähigkeitskontrollen. Kein Schluss auf aktive Live-Produkte.

Die originale Einfassrechnung verwendet umschließende Fläche (auch rund/oval), Hundertstel-Aufrundung und gerundete Umfangszentimeter als eigene Kettelmenge. Der Mindestauftragswert erhöht nur die Materialmenge um den noch nicht durch die Kante gedeckten Betrag. Der erzeugte Payload nennt bei Mindestpreis die erhöhte abgerechnete Fläche und den ursprünglichen Flächenwunsch. 47 lokale Fälle mit gerendertem Datenvertrag und Originalfunktionen belegen diesen Ablauf; keine Layout-/Section-Lifecycle-Aussage.

Bei separat konfiguriertem, nicht verfügbarem Kettelservice verliert Liquid den Ausfallstatus (`null`). JS rechnet und sendet dann nur Material, nennt es aber weiterhin „Gekettelt“ (TP-005). Ein absichtlich nicht konfigurierter Service kann einen anderen Preisvertrag haben und ist nicht automatisch ebenfalls ein Fehler.

Sechs weitere Quellen sind hashgleich mit dem historischen Live-Snapshot: Einfassblock, Einfass-JS, TPMass, Einfasstemplate, Farb- und Bandsnippet. Die lokale interne Mail wurde mit den 29 erzeugten Payloads gerendert; eingesetzte Admin-Vorlage weiter unbekannt. Keine Shopdatei geändert.

## Ergänzung PR-022

Der Unterlagenpfad bleibt im Rollenblock: Templateprodukt → Liquid-Filter auf Verfügbarkeit/positiven Preis → JS-Breite aus Variantentitel → `extrasAllowed` über exakte Hauptvariantenfreigabe → `updateExtras` → Zusatzpreis in `calculate` und gleiche Auswahl erneut vor Submit. Eine Unterlagenposition enthält `Ausführung` und `Bahnen`; zusammen mit Material/Fußleiste bekommt sie `_Gruppe`. Eventmenge folgt der Summe aller Positionsmengen.

Die Auswahl minimiert Kosten unter einzelnen Varianten mit gleich breiten, ungedrehten Bahnen und vollen Metern je Bahn. PR-022 prüft 61 lokale Daten-/Integrationsfälle und 198.468 Grenzen gegen unabhängige Integerarithmetik, ohne neuen Rechenfehler. Andere Verlegepläne und heutige Liefer-/Preiseinheiten sind H-008, keine belegten Implementierungsfehler.

Vier relevante Themequellen (Rollenblock, Rollenart-Asset, Rollentemplate und Farbsnippet) sind weiterhin hashgleich zum historischen Live-Snapshot. Keine neue Kartierung und keine Shopänderung. Der Preisbereich ist noch nicht vollständig: `tp-teppich-wunschmass` und übrige Produktarten bleiben offen.
