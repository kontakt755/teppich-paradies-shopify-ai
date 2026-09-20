# Architektur – bisher belegter Ausschnitt

Historische Kartierung vom 19.09. übernommen: `evidence/source-manifest.json` enthält 643 Dateien für acht Theme-Verzeichnisse; 642 waren zwischen damaligem Repository und Live-Snapshot gleich, `config/settings_data.json` abweichend. Dies ist eine historische Feststellung, keine neue Live-Synchronisierung.

S01-Basis: `d63acaf`; S05 übernimmt Audit-Sicherungscommit `840b883`. Gegenüber `6672909` änderten sich Dashboarddaten sowie interne Bestellmail und zugehöriger Test; keine der beiden jetzt geprüften Rechnerdateien. Für diese beiden Dateien wurde zusätzlich ihr SHA-256 gegen den historischen Live-Hash geprüft: identisch.

## Preiswege

- Paketware nutzt `blocks/paket-auswahl.liquid`: HTML/CSS und eingebettetes JavaScript. Paketfläche kommt vom Produktmetafeld, Preis/ID aus der Variante; Farbwechsel führt beide über `variant:update` nach. Die tatsächliche Cart-Menge ist eine ganze Anzahl Originalpakete.
- Rollenware nutzt `blocks/tp-rollware-rechner.liquid` plus `assets/tp-rollware-art.js`. Hauptfläche, Raummaß und Zusatzprodukte werden vor einem eigenen Cart-Request berechnet. Abrechnung kann je Produkt volle m² oder 0,01-m²-Einheiten verwenden.
- `product.einfassung.json` lädt `tp-einfass-konfigurator`; dieser lädt `tp-masstepich-rechnung.js`, `tp-zuschnitt-abgleich.js`, `tp-einfass-konfigurator.js`. PR-021 hat den lokalen Datenvertrag und die Preis-/Payload-Integration geprüft; reale Produktfreigaben, Browserbedienung und nachgelagerter Cart-/Abgleich bleiben offen.
- `product.teppich.json` bindet einen anderen Block `tp-teppich-wunschmass` ein. Seine Existenz ist kein Beleg für toten Code. Historische Produktprüfungen 09./11.09. melden keine aktive Nutzung; heutige Zuordnung H-009.
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

## Ergänzung PR-023a

Der separate Teppich-Wunschmaßblock verwendet tatsächliche Formflächen, Rundung auf ganze 0,01-m²-Einheiten, Zuschlag ebenfalls in ganzen Preiseinheiten und einen Mindestpreis über die Summe. 46 lokale Fälle am vollständigen Liquidblock und eingebetteten JS, Originalrequests abgefangen. Block/Template weiterhin hashgleich zum historischen Live-Snapshot. Fehlendes/0/negatives Mindestbreitenmetafeld verbirgt den Block.

TP-006 trennt irrtümlich Maßpräzision zwischen Preisrechnung und Properties; TP-007 sperrt den laufenden Request nur über den durch Render überschreibbaren Buttonzustand. Zwei weitere bedingte Prüfbereiche (globale Formular-ID/Verfügbarkeit und fehlende numerische Grenzen) bleiben H-010 bis echte Produkt-/DOM-Bedingungen belegt sind. Keine pauschale Wiederverwendung des anderen Einfassrechners und keine Löschung des historisch ungenutzten Pfads empfohlen.

`buy-buttons` und Appblock sind im aktuellen `product.teppich.json` deaktiviert. Ältere Reviewtexte mit aktivem Standard-Button nicht ungeprüft übernehmen. Ob Farbe/Variante ohne dessen Formular zuverlässig aktualisiert wird, gehört zur späteren H-010/VAR-001-Integration; der lokale ID-Test behauptet keinen solchen Browsernachweis.

## Ergänzung PR-023b.1

Paketware wird über das positive Flächenmetafeld erkannt, vor Rollenbreite/Produkttyp. Der Original-Datenvertrag wurde jetzt auch für den dokumentierten Quadra-Paketweg und synthetische Klebevinylverträge über Liquidpreis, vollständige JS-IIFE, Payload und Cart-Zeile verfolgt. 17 Fälle/14 Requests/28 Cart-Renderings; elf historische Hashvergleiche. Karten und PDP rechnen denselben Variantenpreis auf €/m² um, Menge bleibt ganze Pakete. Fehlende Stückdaten werden nicht ergänzt. Preis-/Variantenereignisse nur im Adapter geprüft.

TP-008 entsteht erst beim Anzeigen der Gesamtfläche im Cart: `tp-cart-paketzeile` formatiert immer zwei Stellen, während Rechner und Inhaltssnippet Metafeldpräzision bis drei Stellen übernehmen. Aktuelle Zeilenmenge wird korrekt verwendet; Preis-/Mengenquelle muss nicht geändert werden.

PVC und Fixpreis wurden nur kartiert: Rollenrechner eigener Request, Stück-/Zubehörmengenhilfe ausschließlich Eingabe ins Standardformular, welches `product-form.js` serialisiert. PR-023b.2 prüft diesen Übergang als Nächstes. Historische Datenberichte ersetzen weiterhin keine aktuelle Shopify-Abfrage.
