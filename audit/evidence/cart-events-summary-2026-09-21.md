# S09 – CART-002b.1 Mengenereignisse und Debounce

21.09.2026, Phase 1. Zwölf lokale Diagnosefälle, elf abgefangene Requests, fünf Fehlfälle TP-011/P2, fünf historische Quellenhashvergleiche. Syntax und erster Diagnoselauf bestanden. Keine Shopänderung oder S01–S08-Wiederholung.

## Befund

Original-Cartklasse besitzt einen 300-ms-Timer für alle document-Mengenereignisse. Erst nach Ablauf prüft sie, ob das Ziel zur Komponente gehört. Zwei verschiedene Zeilen bei 0/100 ms ändern ihre Eingabefelder von 2 auf 3, senden jedoch nur Zeile 2. Umgekehrte Reihenfolge und 299-ms-Abstand verlieren ebenfalls die erste Änderung. Ein fremdes Produktmengenereignis innerhalb der Wartezeit löscht sogar den einzigen geplanten Cartrequest. Zwei modellierte Cart-Komponenten verdrängen einander entsprechend.

Positive Kontrollen: eine Änderung exakt nach 300 ms; drei Änderungen derselben Zeile liefern nur den letzten Wert 5; Blur/Plus derselben Zeile korrekt. Fremdes Ereignis allein ignoriert, fremdes vor eigenem Ereignis verhindert den eigenen Request nicht. Über 301 ms werden beide Ereignisse ausgeführt, allerdings als reine Timerkontrolle bei im Adapter ausstehenden Responses.

TP-011 vollständig mit Implementation Brief in ISSUES.md. Derselbe Shared-Cart-Code wie TP-010; kein Fix/READY-Pack vor verbleibender Response-/Sectionprüfung.

## Evidence und Grenzen

`reproduce-cart-events.mjs` führt vollständige Original-Selektor-/Cart-/Eventklassen sowie unveränderte debounce, parseIntOrDefault und fetchConfig aus. Native Node Event/EventTarget halten das tatsächliche Selektorziel; DOM-Abstammung und document-Bubbling sind explizite Adapter. setTimeout/clearTimeout werden deterministisch virtuell getaktet. Alle Requests bleiben vor dem Netzwerk ausstehend.

Kein echter Browser, keine CSS-/Pointer-/Keyboardabnahme, kein Shopify-Request/Serverpreis oder Response-Morph. Der Zweizeilenfehler ist unabhängig von einer zweiten Komponente; tatsächliche Cross-Komponenten-/PDP-Erreichbarkeit bleibt H-012. Die 301-ms-Kontrolle ruft Methoden direkt auf und behauptet keine Pointerbedienbarkeit während cart-items-disabled. Vorhandene Cartstrukturtests aus S08 nicht nochmals ausgeführt.

Nächster Schritt CART-002b.2: Antwortreihenfolge, SectionRenderer vs. direkter Morph, Zeilenidentität nach Änderung/Entfernen, Drawer-Ereignisse. Quellen section-renderer und cart-drawer bereits gelesen, noch nicht ausgeführt. Keine Teilprüfung als vollständige Drawer-/Checkoutabnahme werten.
