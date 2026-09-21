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

## Ergänzung PR-023b.2

S07 schließt lokale PVC-/Stückvertragsprüfung mit 30 Fällen/26 Requests ab. TP-009 sitzt zwischen globalem Liquid-Fallback, cm-exklusiver Breitenoptionserkennung und variantenbezogener ID-Auswahl. Originale Initialisierung, syncArtUi, calculate und Submit bestätigen: richtige ID bei falscher erster Breite. Einzelbreitenfallback und cm-Optionen bestehen. Historische Meterlabels sind belegt, aktueller Produkt-/Metafeldstand bleibt H-011.

Stück-/Zubehörpfad: vollständiger Mengenhilfeblock bestimmt Modus aus belegten Produktlängen, Variantenoption/Reichweite oder Titel. JS schreibt die ganze Einheitenmenge in das bestehende Standardfeld; vollständige Produktform-Klasse serialisiert ID/quantity, ohne Preis zu senden. 20 Fälle/18 Requests belegen den lokalen Übergang. Native DOM-/FormData-/Section-Lifecycles und Antwortverarbeitung sind ausdrücklich nicht mitgeprüft. Alle Preise synthetisch; kein zusätzlicher Kaufweg.

Neun Rollen-/Mengenhilfe-/Formular-/Templatequellen hashgleich mit historischem Live-Snapshot. Nächster Bereich CART-002a, keine Reparatur oder erneute Preisgrundprüfung.

## Ergänzung S08 / CART-002a

Originale Servermarkup-Regeln und Browsergruppenfunktionen für 20 Cartzustände/35 Zeilen abgeglichen. Berechnete Mengen bleiben als updates[] im Formular, native Selector-Grenzen min=max liefern auch nach Original-JS-Initialisierung gesperrte Buttons (28 Zeilen). Stück-/Paketware bleibt normal änderbar. Pflichtfeld und Checkoutmarker sind eine UI-Regel, keine Shopify Cart/Checkout Validation Function.

Cartklasse entfernt Gruppen per Keys im update-Request und einzelne Zeilen per change. Darstellung wird bereits vor Antwort entfernt/leer ersetzt. Fehlerpfad stellt sie nicht wieder her (TP-010); Fehlercontainer gehört zur entfernten Zeile. Erfolgreiche Section-Morphs im Adapter nur modelliert; echte Refs-/Event-/Drawerabläufe CART-002b offen.

Zuschnittasset nutzt serialisierte GET/POST/Gegenprobe, setzt nur den Attribute-Unterschied, behält sonstige Attribute und ignoriert eigene Events. Zehn lokale Abläufe einschließlich ausbleibender Übernahme und explizitem Retry bestanden. Zehn Quellhashes historisch gleich. Keine neuen Live-/Produktdaten und keine produktiven Änderungen.

## Ergänzung S09 / CART-002b.1

Die Menge wird im Originalselektor vor Eventversand lokal gesetzt. Das originale QuantitySelectorUpdateEvent wird am document von jeder Cartklasse empfangen. Ein Timer pro kompletter Komponente bündelt alle Ziele; die Eigentums-/Zeilenprüfung liegt erst im verzögerten Handler. TP-011: anderer Zeilenwert oder fremdes Ereignis ersetzt dadurch den noch gültigen geplanten Wert. Gleiche Zeile wird korrekt zusammengefasst.

Zwölf Originalcodefälle mit nativen Node-Events, explizitem Bubbling-/DOM- und virtuellem Timeradapter. Elf Requests abgefangen, Responses bleiben ausstehend. SectionRenderer und Drawer nur gelesen: eigener SectionRenderer kann Morphs abbrechen, direkte Cartantwort nutzt einen anderen Aufrufpfad; noch kein neuer Fehler daraus abgeleitet. CART-002b.2 folgt.


## S10 – Section-Antworten und Fehler-Retry

S10 / CART-002b.2a lokal abgeschlossen: fünf Original-SectionRenderer-Fälle, zwei Defektfälle TP-012/P2, ein historischer Hashvergleich. Nach Fetch-/Bodyfehler starten drei Retries derselben URL keinen neuen Request. Andere Section funktioniert. Erfolgs-Deduplizierung, Cache/Forced Refresh und Schutz gegen alte Antworten bei beiden Antwortreihenfolgen bestanden. DOM/Parser/Morph adaptiert; kein Browser-/Livebeleg, keine Shopreparatur. Nächster Schritt CART-002b.2b: direkte Cartantworten, Zeilenidentität und Zusammenspiel mit SectionRenderer, danach Drawer/Dialog-Lifecycle. Keine bisherigen Diagnosen ohne Quelländerung wiederholen.

Evidence: `audit/evidence/section-responses-2026-09-21.json`; Script: `audit/scripts/reproduce-section-responses.mjs`. Route TASK-72075157B1A8, B/STATIC, kein Executor gestartet. Renderer ist gemeinsamer Abhängigkeitspunkt: TP-012 separat planen, Cart-Aufruferkonflikte mit TP-010/011 beachten.


## S11 – Direkte Cartantworten und Zeilenidentität

S11 / CART-002b.2b lokal abgeschlossen: acht Originalcode-Antwortfälle, vier historische SHA-256-Vergleiche, Syntax und Erstlauf PASS. Direkte Erfolgsantworten auf Cartseite/Drawer verwenden full/hydration korrekt; stabiler Fehlerindex setzt Eingabe zurück und zeigt Feedback. Bei zwei programmatisch gestarteten Mutationen entsperrt schon die erste Antwort; verspätete ältere Antwort kann jüngere überschreiben. Ein durch Original-DiscountEvent gestarteter Section-Request kann nach neuer direkter Cartantwort noch morphieren. Bei manuell verschobenen Refs landet Fehlerfeedback am früheren Index und damit anderer Zeile. Diese Überschneidungen sind H-013, keine zusätzlich bestätigten Shopissues: Pointer-/Debounce-Erreichbarkeit, Server-Snapshotreihenfolge, echte MutationObserver-/Morphabläufe fehlen. Keine Shopänderung, keine S01–S10-Replays.

Evidence: `audit/evidence/cart-responses-2026-09-21.json`; Script: `audit/scripts/reproduce-cart-responses.mjs`. Route TASK-6FFC7626F671, B/STATIC; kein Executor/Agent gestartet.

Nächster konkreter Schritt: CART-002b.2c: assets/cart-drawer.js und assets/dialog.js mit events.js auf Eventtypen, Öffnen/Schließen, History-/Disconnect-Lifecycle prüfen. Danach H-012/H-013 im echten Browser bei verfügbarem Runner; keine abgeschlossenen lokalen Response-/Retry-/Debouncefälle ohne Quellenänderung wiederholen.


## S12 – Drawer-/Dialog-Lifecycle

S12 / CART-002b.2c lokal abgeschlossen: elf Originalcode-Lifecyclefälle, fünf historische Quellhashvergleiche, Syntax/Erstlauf PASS. Desktop/Mobile öffnen und schließen, Scrollstil/-position, modelliertes Back ohne doppelten Rücksprung, Disconnect/Reconnect der Listener und Sticky-Schwellen funktionieren in den Fixtures. Allgemeines CartUpdateEvent öffnet ebenfalls bei auto-open; die erste Zählansage bleibt leer, weil Öffnen erst im RAF erfolgt. Close/Disconnect vor diesem RAF verhindert dessen spätere Ausführung nicht. Letztere Beobachtungen bleiben H-014: natives Dialog-/Fokus-/Attach-/Historyverhalten und reale Erreichbarkeit nicht belegt. Keine neue bestätigte Issue-ID, keine Reparatur, keine früheren Diagnosen wiederholt.

Evidence: `audit/evidence/drawer-lifecycle-2026-09-21.json`; Script: `audit/scripts/reproduce-drawer-lifecycle.mjs`. Originale Klassen und Utilityfunktionen; modellierte Element-/History-/RAF-Umgebung, leere Animationsliste. Keine Native-Dialog-/Fokusabnahme. Route TASK-EECCC76EC036 B/STATIC; kein Executor.

Nächster konkreter Schritt: CART-003: Browserfähigkeit einmal neu prüfen (S01-Sperre ist historisch). Verfügbaren Browser nach Skill verwenden, öffentlichen Shop ohne Kaufabschluss zunächst rein lesend auf Drawer-Öffnen/Schließen, Fokus/Escape, Mobile Back/Reload und H-014 prüfen; Live-Theme vor livebezogenen Schlussfolgerungen aktuell verifizieren. Falls Browserzugriff weiterhin blockiert, Grenze konkret dokumentieren und sequenziell lokale Checkout-/Express-/Formularverträge prüfen. Keine S08–S12-Replays ohne Quelländerung.


## S13 – Checkoutvertrag und Browserberechtigung (22.09.2026)

S13 / CART-003a: Browserzugang neu geprüft. Chrome-Verbindung verfügbar, Navigation zum öffentlichen Shop jedoch durch Browser-Sicherheitsprüfung wegen verweigerter Zugriffsberechtigung abgelehnt. Kein alternativer Zugriff versucht, keine Live-Theme-Verifikation. Anschließend neun lokale Checkout-Vertragsfälle bestanden (acht Original-CTA-Liquidrenderings, ein statischer Formular-/Header-/CSS-Vertrag), vier historische Quellhashvergleiche. Normale CTA verweist auf cart-form; Pflichtsperrfeld innerhalb POST-Formular; Drawer auf Carttemplate ausgeschlossen. Express erfordert Plattformflag und Themeeinstellung. Sperr-CSS setzt pointer-events:none und opacity:0.4, versteckt/deaktiviert Express nicht semantisch. Tastatur-/Expressumgehung bleibt H-015, kein neuer bestätigter Fehler.

Evidence: `audit/evidence/checkout-contracts-2026-09-22.json`, `browser-access-2026-09-22.json`; Script `audit/scripts/reproduce-checkout-contracts.mjs`. Route TASK-56DE810ED955 B/STATIC; kein Executor. Erster Lauf scheiterte an falscher Diagnoseannahme display:none; nach Lesen des CSS wurde ausschließlich die Auditassertion auf pointer-events/opacity korrigiert, zweiter Lauf PASS. Keine Shopreparatur.

Nächster konkreter Schritt: CART-003b: lokale Rabatt-/Cart-Notiz-Verträge in assets/cart-discount.js und assets/cart-note.js sowie snippets/cart-summary.liquid prüfen (Fehler, mehrfaches Absenden, Persistenz/Sections). Browserprüfung H-012–015 erst nach geänderter Zugriffsberechtigung fortsetzen; keine alternative Browser-/HTTP-/CDP-Umgehung oder wiederholte Zugriffsversuche. Vorhandene S08–S13-Diagnosen ohne Quelländerung nicht wiederholen.
