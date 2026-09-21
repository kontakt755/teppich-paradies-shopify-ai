# Abhängigkeiten und Konflikte

Stand: 21.09.2026. Teilkarte des Preis- und Warenkorbbereichs, keine abgeschlossene Gesamtarchitektur.

| Datei / Pfad | Einstufung | Rolle / Abhängigkeit | Änderungsrisiko |
| --- | --- | --- | --- |
| `blocks/paket-auswahl.liquid` | CORE FILE / SHARED FILE / HIGH RISK | Eingabe → Paketmenge → Preis → `/cart/add.js`; empfängt `variant:update` | Alle eingebundenen Paketprodukte betroffen; TP-001/002 nur gemeinsam koordinieren |
| `templates/product.json`, `product.planken.json`, `product.fliese.json` | SHARED FILE / HIGH RISK | Binden Paketblock ein | Im Fix-Pack nicht ändern |
| `snippets/tp-cart-paketzeile.liquid` | SHARED FILE / HIGH RISK | Fläche/Stückzahl aus echter Cartmenge; TP-008: feste Zwei-Stellen-Formatierung | Nur Darstellung, Mengenquelle erhalten; gemeinsame Cartdatei, CART-002 noch offen |
| `blocks/tp-rollware-rechner.liquid` | CORE FILE / HIGH RISK | Rollen-/Raummaß, Validierung, Extras, Gruppen-Payload; Unterlagenvarianten kommen gefiltert aus Liquid | TP-003/004/009 teilen Rollenblock; TP-009 verbindet Breitenvertrag und gewählte Variante; PR-022 Unterlagenpreis lokal korrekt, bei späteren Änderungen regressionsprüfen |
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

In S06 kartierter, inzwischen S07 lokal geprüfter Pfad PR-023b.2: `product.fixpreis`/`product.zubehoer` → `tp-zubehoer-menge` schreibt Standardmengenfeld → `assets/product-form.js` serialisiert Formular → Cart. `product.rolle` verwendet eigenen Rollenpayload. 30 Fälle/26 Requests lokal geprüft; echte DOM-/Serverintegration weiterhin offen.

## Ergänzung PR-023b.2 / TP-009

`tp-zubehoer-menge` (SHARED FILE / HIGH RISK) liest belegte Längen/Flächen, setzt bestehendes Mengenfeld und sendet input/change. `product-form.js` (CORE FILE / SHARED FILE / HIGH RISK) serialisiert das Feld via FormData/fetchConfig; kein separater Zubehör-Cartpreis. 20 lokale Fälle/18 Requests korrekt, aber echte Picker-/Section-Ereignisse, Selektorvalidierung und Serverantworten noch offen.

PVC: Metafeldrollenbreite der ersten Variante → globaler fallback_width_cm → Art-Optionserkennung (nur cm) → wIdx=-1 → selectedWidth nimmt stets erste Breite. Variante folgt dagegen der aktuellen Auswahl; dadurch TP-009. Rollenblock und `tp-rollware-art.js` gemeinsam betrachten. `toCm` liest auch Maßeingaben, daher Einheitenänderung sorgfältig begrenzen. Mehrbreitenfallback nicht mit dem funktionierenden Einzelbreitenfallback verwechseln.

**FILE CONFLICT:** TP-003/004/009 berühren denselben Rollenblock; TP-009 zusätzlich Shared-Art-Asset. Später ein abgestimmter Arbeitsblock mit sequenziellen Fixschritten und gezielter Preis-/Raummaß-/Service-Regression. Keine Änderung an Preisen/Varianten/Metafeldern als Workaround. H-011 vor Live-Abnahme klären. Aktuell weiterhin nur Audit.

## Ergänzung S08 / CART-002a

`cart-products` → `tp-cart-gruppe` rendert Klassifikation/Gruppe/Kundeneinheit/Sperrmarker; `quantity-selector` klemmt berechnete Zeilen auf min=max. Originale Selektorklassen lassen diese Buttons gesperrt. Normale Stück-/Paketware bleibt änderbar. 35 lokale Zeilenrenderings belegen diesen Vertrag im geprüften Umfang, keine Serversperre.

`component-cart-items.js` (CORE FILE / SHARED FILE / HIGH RISK) → gruppierte Keys aus gerendertem data-tp-gruppe → `/cart/update.js`, einzeln `/cart/change.js` → Section-Morph/Event. TP-010: paralleler optimistischer DOM-Entfernenpfad ohne Wiederherstellung bei Requestfehler; Inlinefehler gehört zur entfernten Zeile. Component-Refs/MutationObserver und Animation sind zusätzliche Abhängigkeiten, echter Lifecycle bleibt CART-002b/H-012.

`_Zuschnitt` + `_Gruppe` → `tp-zuschnitt-abgleich.js` → serialisierte GET/Attribute-POST/Gegenprobe → cart:update → Liquid-Sperre neu rendern. Nur Zuschnittattribute ändern; sonstige Attribute erhalten. Zehn lokale Abläufe einschließlich Fehler/Retry/Queue bestanden. Direkte API-/Expresspfade nicht als serverseitig validiert ausgeben.

**FILE CONFLICT:** TP-010 und kommende Ereignis-/Sectionfixes teilen die Cartklasse; TP-008 teilt angrenzendes Cartmarkup, nicht denselben Formatierungscode. Keine gemeinsame Großreparatur; CART-002b zuerst abschließen, kleine getrennte Schritte mit gezielter Regression. Alle Cartkern-Dateien HIGH RISK, Phase 1 nur Diagnose.

## Ergänzung S09 / CART-002b.1

Original-QuantitySelector → QuantitySelectorUpdateEvent (bubbling, auch Produktseite) → document-Listener jeder Cartklasse → ein gemeinsamer 300-ms-Timer → erst danach contains/Zeile prüfen → change-Request. TP-011 verliert dadurch frühere andere Zeilen oder eigene Events nach fremdem Ereignis. Utility debounce korrekt für ein Ziel; die Cart-Einbindung braucht zielbezogene Planung und frühe Filterung.

**FILE CONFLICT:** TP-010/011 teilen component-cart-items.js (CORE/SHARED/HIGH RISK). Timerplanung nicht unabhängig von Antwortreihenfolge, Fehlerwiederherstellung und nach Morph veränderter Zeilenidentität fixen. CART-002b.2 zuerst. Events/Utilities/Selektor nicht pauschal global umbauen. Fünf Originalquellen hashgleich; zwölf lokale Fälle ohne Response-/Lifecycleabnahme.


## S10 – Section-Antworten und Fehler-Retry

S10 / CART-002b.2a lokal abgeschlossen: fünf Original-SectionRenderer-Fälle, zwei Defektfälle TP-012/P2, ein historischer Hashvergleich. Nach Fetch-/Bodyfehler starten drei Retries derselben URL keinen neuen Request. Andere Section funktioniert. Erfolgs-Deduplizierung, Cache/Forced Refresh und Schutz gegen alte Antworten bei beiden Antwortreihenfolgen bestanden. DOM/Parser/Morph adaptiert; kein Browser-/Livebeleg, keine Shopreparatur. Nächster Schritt CART-002b.2b: direkte Cartantworten, Zeilenidentität und Zusammenspiel mit SectionRenderer, danach Drawer/Dialog-Lifecycle. Keine bisherigen Diagnosen ohne Quelländerung wiederholen.

Evidence: `audit/evidence/section-responses-2026-09-21.json`; Script: `audit/scripts/reproduce-section-responses.mjs`. Route TASK-72075157B1A8, B/STATIC, kein Executor gestartet. Renderer ist gemeinsamer Abhängigkeitspunkt: TP-012 separat planen, Cart-Aufruferkonflikte mit TP-010/011 beachten.


## S11 – Direkte Cartantworten und Zeilenidentität

S11 / CART-002b.2b lokal abgeschlossen: acht Originalcode-Antwortfälle, vier historische SHA-256-Vergleiche, Syntax und Erstlauf PASS. Direkte Erfolgsantworten auf Cartseite/Drawer verwenden full/hydration korrekt; stabiler Fehlerindex setzt Eingabe zurück und zeigt Feedback. Bei zwei programmatisch gestarteten Mutationen entsperrt schon die erste Antwort; verspätete ältere Antwort kann jüngere überschreiben. Ein durch Original-DiscountEvent gestarteter Section-Request kann nach neuer direkter Cartantwort noch morphieren. Bei manuell verschobenen Refs landet Fehlerfeedback am früheren Index und damit anderer Zeile. Diese Überschneidungen sind H-013, keine zusätzlich bestätigten Shopissues: Pointer-/Debounce-Erreichbarkeit, Server-Snapshotreihenfolge, echte MutationObserver-/Morphabläufe fehlen. Keine Shopänderung, keine S01–S10-Replays.

Evidence: `audit/evidence/cart-responses-2026-09-21.json`; Script: `audit/scripts/reproduce-cart-responses.mjs`. Route TASK-6FFC7626F671, B/STATIC; kein Executor/Agent gestartet.

Nächster konkreter Schritt: CART-002b.2c: assets/cart-drawer.js und assets/dialog.js mit events.js auf Eventtypen, Öffnen/Schließen, History-/Disconnect-Lifecycle prüfen. Danach H-012/H-013 im echten Browser bei verfügbarem Runner; keine abgeschlossenen lokalen Response-/Retry-/Debouncefälle ohne Quellenänderung wiederholen.

CORE/SHARED/HIGH RISK: component-cart-items.updateQuantity → CartUpdateEvent → direkter morphSection; daneben DiscountUpdateEvent → SectionRenderer mit eigener Abbruchverwaltung. Ein direkter Morph invalidiert dessen laufenden Controller nicht. Fehlerzuordnung liest aktuelle Refs anhand des alten numerischen line-Werts. TP-010/011 dürfen diese Antwort-/Identitätsgrenzen nicht verschärfen; H-013 vor konkurrierenden Queue-Fixes klären.


## S12 – Drawer-/Dialog-Lifecycle

S12 / CART-002b.2c lokal abgeschlossen: elf Originalcode-Lifecyclefälle, fünf historische Quellhashvergleiche, Syntax/Erstlauf PASS. Desktop/Mobile öffnen und schließen, Scrollstil/-position, modelliertes Back ohne doppelten Rücksprung, Disconnect/Reconnect der Listener und Sticky-Schwellen funktionieren in den Fixtures. Allgemeines CartUpdateEvent öffnet ebenfalls bei auto-open; die erste Zählansage bleibt leer, weil Öffnen erst im RAF erfolgt. Close/Disconnect vor diesem RAF verhindert dessen spätere Ausführung nicht. Letztere Beobachtungen bleiben H-014: natives Dialog-/Fokus-/Attach-/Historyverhalten und reale Erreichbarkeit nicht belegt. Keine neue bestätigte Issue-ID, keine Reparatur, keine früheren Diagnosen wiederholt.

Evidence: `audit/evidence/drawer-lifecycle-2026-09-21.json`; Script: `audit/scripts/reproduce-drawer-lifecycle.mjs`. Originale Klassen und Utilityfunktionen; modellierte Element-/History-/RAF-Umgebung, leere Animationsliste. Keine Native-Dialog-/Fokusabnahme. Route TASK-EECCC76EC036 B/STATIC; kein Executor.

Nächster konkreter Schritt: CART-003: Browserfähigkeit einmal neu prüfen (S01-Sperre ist historisch). Verfügbaren Browser nach Skill verwenden, öffentlichen Shop ohne Kaufabschluss zunächst rein lesend auf Drawer-Öffnen/Schließen, Fokus/Escape, Mobile Back/Reload und H-014 prüfen; Live-Theme vor livebezogenen Schlussfolgerungen aktuell verifizieren. Falls Browserzugriff weiterhin blockiert, Grenze konkret dokumentieren und sequenziell lokale Checkout-/Express-/Formularverträge prüfen. Keine S08–S12-Replays ohne Quelländerung.

SHARED/HIGH RISK: dialog.js wird über Cart hinaus verwendet. showDialog prüft open vor RAF; Close prüft den noch geschlossenen Zustand, Disconnect entfernt Listener, storniert aber RAF nicht. cart-drawer.js bindet CartAddEvent.eventName (=cart:update), einschließlich allgemeiner Aktualisierungen; vorhandene Paketlogik verlässt sich laut Kommentar darauf. Eventnamen nicht pauschal trennen. header-actions.liquid steuert auto-open über Einstellung. H-014 vor Fixvorschlag prüfen.


## S13 – Checkoutvertrag und Browserberechtigung (22.09.2026)

S13 / CART-003a: Browserzugang neu geprüft. Chrome-Verbindung verfügbar, Navigation zum öffentlichen Shop jedoch durch Browser-Sicherheitsprüfung wegen verweigerter Zugriffsberechtigung abgelehnt. Kein alternativer Zugriff versucht, keine Live-Theme-Verifikation. Anschließend neun lokale Checkout-Vertragsfälle bestanden (acht Original-CTA-Liquidrenderings, ein statischer Formular-/Header-/CSS-Vertrag), vier historische Quellhashvergleiche. Normale CTA verweist auf cart-form; Pflichtsperrfeld innerhalb POST-Formular; Drawer auf Carttemplate ausgeschlossen. Express erfordert Plattformflag und Themeeinstellung. Sperr-CSS setzt pointer-events:none und opacity:0.4, versteckt/deaktiviert Express nicht semantisch. Tastatur-/Expressumgehung bleibt H-015, kein neuer bestätigter Fehler.

Evidence: `audit/evidence/checkout-contracts-2026-09-22.json`, `browser-access-2026-09-22.json`; Script `audit/scripts/reproduce-checkout-contracts.mjs`. Route TASK-56DE810ED955 B/STATIC; kein Executor. Erster Lauf scheiterte an falscher Diagnoseannahme display:none; nach Lesen des CSS wurde ausschließlich die Auditassertion auf pointer-events/opacity korrigiert, zweiter Lauf PASS. Keine Shopreparatur.

Nächster konkreter Schritt: CART-003b: lokale Rabatt-/Cart-Notiz-Verträge in assets/cart-discount.js und assets/cart-note.js sowie snippets/cart-summary.liquid prüfen (Fehler, mehrfaches Absenden, Persistenz/Sections). Browserprüfung H-012–015 erst nach geänderter Zugriffsberechtigung fortsetzen; keine alternative Browser-/HTTP-/CDP-Umgehung oder wiederholte Zugriffsversuche. Vorhandene S08–S13-Diagnosen ohne Quelländerung nicht wiederholen.


## S14 – Rabattfehler (22.09.2026)

S14 / CART-003b.1: sechs Original-Rabattfälle, drei stille Fehlerfälle TP-013/P3, vier historische Quellhashvergleiche. Erfolgreicher Rabatt dispatcht DiscountUpdateEvent und morphiert; nicht anwendbarer Code und Versandrabatt-Sonderfall zeigen vorhandene Fehlermeldung. Netzwerk-, HTTP-Fehler-JSON ohne discount_codes und ungültiges JSON enden ohne sichtbares Feedback. Eingabe bleibt erhalten, expliziter Retry funktioniert. Originalklassen/Utility, DOM/fetch adaptiert; keine Live-Rabattprüfung oder Shopreparatur.

Evidence: `audit/evidence/discount-errors-2026-09-22.json`; Script: `audit/scripts/reproduce-discount-errors.mjs`. Syntax/Erstlauf PASS; Route TASK-70BD752F5C44 B/STATIC, kein Executor. Kein Replay früherer Tests.

Nächster Schritt: CART-003b.2: cart-discount.js Entfernen und überlappende Requests/#activeFetch prüfen; anschließend cart-note.js Debounce/Abbruch/Fehler-/Persistenzvertrag mit cart-summary.liquid. Browser H-012–015 weiterhin berechtigungsbedingt offen; keine Umgehung oder erneute Anfrage ohne geänderte Berechtigung. S01–S14 ohne Quellenänderung nicht wiederholen.


## S15 – Rabattentfernung und Abbruch

S15 / CART-003b.2 lokal abgeschlossen: sechs Originalcodefälle, vier historische Hashvergleiche. Entfernen eines von zwei bzw. des letzten Rabattcodes sendet korrekte verbleibende Codeliste und aktualisiert Event/Section. Netzwerkfehler beim Entfernen erweitert TP-013 (kein Feedback). TP-014/P3: nach Abbruch von Request A durch B löscht A.finally die Referenz auf B; Aktion C bricht B nicht mehr ab. In zwei kontrollierten Folgen (Apply→Apply→Apply und Remove→Apply→Apply) reproduziert. Synthetische Antwortfolge zeigt älteren Morph nach neuem; reale Serverreihenfolge nicht behauptet. Sequentielle Erfolgskontrolle bestanden. Keine Shopreparatur/Liveanfrage.

Evidence: `audit/evidence/discount-concurrency-2026-09-22.json`; Script `audit/scripts/reproduce-discount-concurrency.mjs`. Syntax/Erstlauf PASS, keine S14-Replays. Route TASK-BF056AE4656F B/STATIC; kein Executor. Gemeinsame cart-discount.js für TP-013/014: FILE CONFLICT, kleine abgestimmte Schritte. Native Tastaturaktivierung nicht getestet; Template bindet echten Buttonclick, daher kein Keyboardfehler allein aus KeyboardEvent-Guard behauptet.

Nächster Schritt: CART-003b.3: assets/cart-note.js mit Original-debounce/fetchConfig und snippets/cart-summary.liquid prüfen: Notiz-Debounce, Request-Abbruch/Ownership, HTTP-/Netzfehler, Formular-Persistenz und Disconnect. Rabattfälle S14/S15 ohne Quellenänderung nicht wiederholen. Danach Cart-Audit lokal konsolidieren und offene Browser-/Checkoutabnahme getrennt halten. Browserzugriff bleibt seit S13 berechtigungsbedingt blockiert, keine Umgehung.


## S16 – Warenkorbnotiz

S16 / CART-003b.3: sieben lokale Notizfälle PASS. Original-debounce bündelt Eingaben nach 200 ms; leere und Unicode-Notiz korrekt im Payload. Netzwerk-/HTTP500-Antworten ohne Fehlermeldung, erneute Eingabe startet neuen Request. TP-014 um bedingten Notizpfad erweitert: alter finally löscht neuere Controllerreferenz. Pending Timer läuft nach modelliertem Disconnect weiter; echte DOM-/Serverwirkung offen. Textarea ist name=note mit form=cart-form, daher kein bewiesener Bestellnotizverlust aus Ajaxfehler allein. Lokale Einstellung show_cart_note=false. Vier Code-/Markuphashes historisch identisch; settings_data.json weicht vom historischen Livehash ab, heutige Liveeinstellung nicht verifiziert. Keine Shopänderung.

Evidence: `audit/evidence/cart-note-2026-09-22.json`; Script `audit/scripts/reproduce-cart-note.mjs`. Route TASK-1E9C956DD1CD B/STATIC; kein Executor. Diagnosescript zweimal korrigiert: Konfigurationshash nicht als gleich voraussetzen; Shopify-Kommentar vor JSON-Parsing entfernen. Danach Syntax/Diagnose PASS. Keine alten Diagnosen wiederholt.

Nächster Schritt: CART-004: bisherigen lokalen Cart-Audit konsolidieren, Testmatrix auf offene statt abgeschlossene Fälle reduzieren und passende kleine Cart-/Rabatt-Fix-Packs anhand vollständiger Briefs vorbereiten (weiter Phase 1/2, keine Reparaturen). Browser-/Livegrenzen H-012–015 und Konfigurationsdrift ausdrücklich offen halten. Danach nächsten ungeprüften Rechner-/Variantenvertrag aus TEST_MATRIX auswählen. Keine fertigen Diagnosen wiederholen; Browserberechtigung S13 nicht umgehen.


## S17 – Cart-Konsolidierung (22.09.2026)

S17 / CART-004 abgeschlossen: Cart-Testmatrix S08–S16 konsolidiert, veraltete OFFEN-Einträge korrigiert, Browser-/Livegrenzen separat geführt. FIX_PACK_03_CART_REQUEST_FEEDBACK für TP-013/014 READY zur späteren lokalen Übergabe (inklusive minimaler Ownershipkorrektur der deaktivierten Notiz, keine Aktivierung). Cartkern TP-010/011 und Renderer TP-012 bleiben NOT READY wegen offener Integrations-/Aufrufergrenzen. Keine neuen Issues, Tests nicht erneut ausgeführt, keine Reparatur.

Route TASK-516D83336635 B/STATIC, kein Executor. Reine Dokument-/Link-/Scope-/Secretprüfung, keine alten Produktdiagnosen wiederholt. FILE CONFLICT: Paket 03 bündelt cart-discount.js und begrenzte cart-note.js-Ownership. Keine globale Renderer-/Cartqueueänderung. Paket 02 separat, aber keine Parallelfreigabe.

Nächster Schritt: CALC-001a / H-003: verbleibende Rollenrechner-Zustandswechsel lokal prüfen: Farb-/Artwechsel bei bereits gewählter Fußleiste/Haftunterlage, aktiver Varianten-ID und Preisbasis. Einstieg blocks/tp-rollware-rechner.liquid (change-Handler um 1756/1778), assets/tp-rollware-art.js und anschließender Variantenvertrag. Keine PR-020–023-Mathematik erneut ausführen; echte Picker-/Reload-/Browsernachweise getrennt offen halten.


## S18 – Farb-/Art-/Zubehörzustand

S18 / CALC-001a.1: neun neue Übergangs-/Ereignisverträge PASS, zwei historische Quellhashvergleiche. Original-baseOptions/findVariant/rateOf/updateExtras über persistenten Feldern: Rot Meter→Rot Raum→Blau ohne Zubehörfreigabe→Blau Meter→Rot zurück. ID/Preis folgt gewählter Farbe/Art, Zubehör bei fehlender Freigabe ohne Items, eigene Leistenlänge 7 bleibt erhalten und wird beim Zurückwechseln wieder verwendet. Formular-ID hat Vorrang vor URL (synthetische Kombination); Farbchange plant 120 ms, Formularchange 100 ms, fremder Change nichts. Kein neuer bestätigter Fehler; H-003 nur teilweise geklärt.

Evidence: `audit/evidence/roll-extra-transitions-2026-09-22.json`; Script `audit/scripts/reproduce-roll-extra-transitions.mjs`. Originalfunktionen und document-change-Handler, synthetische Varianten/DOM, artMode gesteuert; Timerplanung erfasst, calculate nicht aus diesem Event ausgeführt. Kein vollständiger Picker-/Morph-/Submitnachweis. Syntax/Erstlauf PASS. Route TASK-E36D4BE4A434 B/STATIC; kein Executor/alte Diagnosen.

Nächster Schritt: CALC-001a.2: syncArtUi + calculate + Submit als zusammenhängende lokale Zustandsfolge prüfen: Wechsel zu Farbe ohne gewählte Rollenbreite bzw. ohne kaufbare Wunschmaßvariante, Art-Rückschaltung und Zubehör/ID im nachfolgenden Payload. Reale Farb-Picker-/Formular-/URL-Synchronisation anschließend VAR-001; keine Browserumgehung, keine fertigen Preisraster erneut ausführen.
