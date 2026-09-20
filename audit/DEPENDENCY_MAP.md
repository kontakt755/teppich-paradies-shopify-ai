# Abhängigkeiten und Konflikte

Stand: 20.09.2026. Teilkarte des derzeitigen Preisbereichs, keine abgeschlossene Gesamtarchitektur.

| Datei / Pfad | Einstufung | Rolle / Abhängigkeit | Änderungsrisiko |
| --- | --- | --- | --- |
| `blocks/paket-auswahl.liquid` | CORE FILE / SHARED FILE / HIGH RISK | Eingabe → Paketmenge → Preis → `/cart/add.js`; empfängt `variant:update` | Alle eingebundenen Paketprodukte betroffen; TP-001/002 nur gemeinsam koordinieren |
| `templates/product.json`, `product.planken.json`, `product.fliese.json` | SHARED FILE / HIGH RISK | Binden Paketblock ein | Im Fix-Pack nicht ändern |
| `snippets/tp-cart-paketzeile.liquid` | SHARED FILE / HIGH RISK | Fläche/Stückzahl aus echter Cartmenge; TP-008: feste Zwei-Stellen-Formatierung | Nur Darstellung, Mengenquelle erhalten; gemeinsame Cartdatei, CART-002 noch offen |
| `blocks/tp-rollware-rechner.liquid` | CORE FILE / HIGH RISK | Rollen-/Raummaß, Validierung, Extras, Gruppen-Payload; Unterlagenvarianten kommen gefiltert aus Liquid | TP-003 und TP-004 teilen Rechnen/Submit; PR-022 Unterlagenpreis lokal korrekt, bei späteren Änderungen regressionsprüfen |
| `assets/tp-rollware-art.js` | SHARED FILE / HIGH RISK | Rollenbreiten, Wunschmaß-Verfügbarkeit, Zugabe, Preisvergleich | Nicht mit separater Einfass-/Formgeometrie gleichsetzen |
| `templates/product.rolle.json` | SHARED FILE / HIGH RISK | Rollrechner mit Produkt-/Serviceblock-Einstellungen | Produktfreigaben und eingestellte Zusatzprodukte vor jeder späteren Änderung prüfen |
| `blocks/tp-einfass-konfigurator.liquid` | CORE FILE / HIGH RISK | Produkt-/Variantengates, Formliste, Mindestpreis und Service-Verfügbarkeit → JSON | PR-021 lokal geprüft; TP-005 verliert Ausfallstatus eines konfigurierten Kettelservice |
| `assets/tp-einfass-konfigurator.js` | CORE FILE / HIGH RISK | Maß-/Formauswahl → TPMass → Material/Kante, Mindestpreis über beide Zeilen → eigener Cart-Request | PR-021 lokal geprüft; TP-005 erfordert abgestimmten Datenvertrag/Gates mit Liquid, keine neue Rechenformel |
| `assets/tp-masstepich-rechnung.js` | SHARED FILE / HIGH RISK | Fläche, Umfang, Hundertstelmenge, Mindestpreis, Kante | Nicht pauschal durch Rundung des Rollenrechners ersetzen |
| `assets/tp-zuschnitt-abgleich.js` | SHARED FILE / HIGH RISK | Einfass-Submit ruft nach Cart-Antwort `TPZuschnitt.abgleichen()` vor Cart-Event/Drawer auf | PR-021 simuliert Erfolg; tatsächlicher Abgleich, Fehlerpfad und Checkout-Sperre im Cart-Audit offen |
| `blocks/tp-teppich-wunschmass.liquid`, `templates/product.teppich.json` | CORE FILE / HIGH RISK | Separater Wunschmaßpfad, echte Fläche, 0,01-m²-Einheiten, Mindestpreis/Zuschlag, eigener Fetch/Redirect | PR-023a lokal geprüft; TP-006/007 teilen Render/Submit. Historisch ungenutzt, H-009/010 offen |
| `assets/tp-cart-gruppen.js`, `snippets/tp-cart-gruppe.liquid` | CORE FILE / SHARED FILE / HIGH RISK | `_Gruppe`, Mengensperren und Zusammenhang von Zusatzpositionen | Preisfix darf Gruppe/Positionssemantik nicht zerstören; Cart-Audit folgt |
| `assets/cart-drawer.js`, `assets/cart-icon.js`, `assets/component-cart-items.js` | SHARED FILE / HIGH RISK | `cart:update`, Drawer und Warenkorbmenge | Ereignisse im lokalen Adapter nicht als voll getestete Browserintegration werten |
| `domains/shopify/benachrichtigungen/interne-bestellmail-block.liquid` | SHARED FILE / HIGH RISK | Maß-/Mengenprüfung aus cm-Maßen und Produktmetafeld; Raummaß ganzzahlig kaufmännisch, Einfassung aufrunden | PR-020: regulärer cmExact-Payload kann durch TP-004 lokal eine Warnung auslösen; eingesetzte Admin-Vorlage unbekannt. Warnregel nicht abschwächen |
| `audit/` | LOW RISK | Belege und spätere Umsetzungsanweisung | Nicht Bestandteil einer Theme-Reparatur |

## Kernpfade

1. Paketmetafelder + Variantenpreis → `paket-auswahl` → Bedarf/Reserve → ganze Pakete → Cart-Request → `cart:update` → Drawer/Cart → Paketzeile aus tatsächlicher Menge.
2. Rollendaten/Servicefreigabe + `tp-rollware-art` → `tp-rollware-rechner` → Materialfläche und optionale Fußleiste/Haftunterlage → gemeinsamer Payload mit `_Gruppe` → Cart-Gruppenlogik. Unterlage: Blockeinstellung `haftunterlage_produkt` → Liquid lässt verfügbare Varianten mit Preis > 0 zu → JS liest 2-/3-stellige cm-Breite aus Titel → nur bei exakter Hauptvariantenfreigabe `Verfügbar` → billigste einzelne Breite für parallele Bahnen, volle lfm pro Bahn. Gruppierte Integration und `cart:update`-Menge PR-022 lokal geprüft; echter Cart/Bestandswechsel offen.
3. Einfassdaten → Liquid-Gates und Farb-/Bandsnippets → `tp-einfass-konfigurator.js` + `TPMass` → umschließende Materialfläche, Hundertstel aufrunden, Umfang, Mindestpreis über Material + Kante → Haupt- und Kettelzeile. Gemeinsame `_Gruppe`, `_Zuschnitt` auf Hauptware; anschließend `TPZuschnitt.abgleichen()` und `cart:update`. PR-021 prüft lokale Rechnung/Properties; echter Cart-/Abgleichpfad offen. TP-005: nicht verfügbarer konfigurierter Service wird zu `null`, fehlende Position bei weiter zugesagter Kettelung.
4. Raummaß: `custom.preis_pro_001_qm` → `cm_exact` im Datenblock → `calculate` und Submit-Menge → `Ihre Breite`/`Gewünschte Länge`/`Fläche` → interne Mail rekonstruiert Menge aus cm-Maßen. Die Preisbox und der Meterware-Tipp teilen die instabile Rundung; die Mail benutzt stabile Integerarithmetik. Der Modusschalter gehört zur Produktdatenkonfiguration und wird im Audit nicht verändert.

## FILE CONFLICT

- `blocks/paket-auswahl.liquid`: TP-001 und TP-002 ändern dieselben Handler. Ein Paket/ein Implementer → Tests → Review. Nicht in zwei unabhängige Branches aufteilen.
- `blocks/tp-rollware-rechner.liquid`: TP-003 und TP-004 teilen `calculate` und Submit. TP-004 berührt zusätzlich `updateMeterTipp`/den Callback zu `tp-rollware-art`. Unterlagenpreisprüfung PR-022 lokal abgeschlossen; H-005/H-008 und echte Cart-/Variantenabläufe offen. Später ein Implementer, getrennte kleine Fixschritte mit Tests. Nicht parallel am Rollenblock arbeiten. Gruppen-/Preisfälle mit gültiger Fußleiste und Unterlage nach Änderungen am Submit gezielt wiederholen.
- Globale Cart-Dateien und Preiseinheiten bleiben in FIX_PACK_02 außerhalb des Änderungsscope. Sobald ein späterer Fix dort eingreifen muss, Konfliktkarte neu bewerten.
- TP-005 teilt mit weiteren Einfassarbeiten Liquid-Datenvertrag und JS-Gates. Beide Dateien nur als abgestimmten Schritt bearbeiten. Der gemeinsame Rechenkern `TPMass` wird dafür voraussichtlich nicht verändert; H-007 ist keine Freigabe für eine zusätzliche Formeländerung. Kein Zusammenlegen mit TP-003/004 nur wegen des Wortes „Rechner“.

Während dieses Watchdog-Auftrags gilt unabhängig von theoretischen Dateikonflikten stets **SEQUENTIAL / keine parallelen Agenten**.

## Ergänzung PR-023a

`custom.wunschmass_mindestbreite_cm > 0` → kompletter Wunschmaßblock → Form aus Metafeld → echte Fläche → Hundertstel aufrunden + Zuschlag in Einheiten / Mindestpreis → einzelne Cartposition → Redirect `/cart`. Ganze Maße werden als `Breite`/`Länge` bzw. `Durchmesser`/`Seitenlänge` übertragen; Mail rekonstruiert daraus die Mindestmenge. Anders als beim Einfasspfad keine Gruppe/kein Kantenprodukt und keine `TPZuschnitt`-Integration in diesem Block.

**FILE CONFLICT:** TP-006 und TP-007 betreffen `blocks/tp-teppich-wunschmass.liquid`, insbesondere `render`/`addToCart`. H-010 berührt zudem globale Formular-/Variantenzuordnung. Erst H-009 aktive Nutzung/Vertrag, dann ein abgestimmter kleiner Arbeitsblock mit sequenziellen Fixschritten. Mail nur regressionsprüfen, nicht als Workaround abschwächen. Die späteren ursprünglichen Einfass-/Rollenfixes betreffen andere Blöcke; die zentrale Mail bleibt eine gemeinsame risikoreiche Schnittstelle.

## Ergänzung PR-023b.1

`custom.qm_pro_paket` → `tp-verkaufseinheit` (Paket vor Rolle) → `tp-price-per-sqm`/`price`/`tp-paketinhalt` sowie Paketblock-Dataset → JS-Paketmenge/private Properties → `cart-products` → `tp-cart-paketzeile`. Die Karte/PDP/Snippets sind SHARED FILE / HIGH RISK, weil alle betroffenen Produktarten dieselben Einheitenregeln nutzen. Quadra ist eine fachlich bestätigte Paketware trotz Produkttyp Teppichboden.

TP-008 lässt sich voraussichtlich auf die Flächenformatierung in `tp-cart-paketzeile` begrenzen. Diese Datei nicht gleichzeitig mit Cart-Gruppen-/Mengenarbeiten bearbeiten; erst CART-002 abgleichen. `line_item.quantity` bleibt die Mengenquelle; kein Fix über alte `_qm_gesamt`-Properties. Paketpreis-/Parserfixes liegen in einer anderen Datei, brauchen aber dieselben Paket-/Stückregressionen. Kein neues Pack ausgeführt.

Kartierter offener Pfad PR-023b.2: `product.fixpreis`/`product.zubehoer` → `tp-zubehoer-menge` schreibt Standardmengenfeld → `assets/product-form.js` serialisiert Formular → Cart. `product.rolle` verwendet eigenen Rollenpayload. Quellen gelesen, konkrete PVC-/Stückpayloadprüfung steht noch aus; nicht als PASS werten.
