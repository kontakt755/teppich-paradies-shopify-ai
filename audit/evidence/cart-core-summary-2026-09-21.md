# S08 – CART-002a Gruppen, Mengensperren und Zuschnittabgleich

21.09.2026, Phase 1, ausschließlich sequenzielle lokale Analyse. Keine Shopänderung, kein realer Cart oder Kaufabschluss.

## Ergebnis und Umfang

43 lokale Fälle: 20 gerenderte Cartzustände, 13 Cartaktionen, zehn Zuschnittabläufe. 35 Zeilenrenderings, 28 Mengenklammern und 34 abgefangene Requests. Zehn Originalquellen hashgleich mit historischem Live-Snapshot. Bestehende vier Cart-Testsuiten: 47/47 PASS.

- Originales Gruppensnippet rendert berechnet/menge/mengenhinweis/hinweis/sperre. Stück- und Paketware bleiben änderbar, berechnete Menge wird als verborgenes updates[] erhalten. Original-Quantity-Snippet setzt min=max=Menge; originale Selektorklassen sperren beide Tasten. 35 Zeilen stimmen im geprüften Datenumfang mit JS-Klassifikation und Kundeneinheiten überein.
- Vollständige Gruppen, verwaiste Services, fehlende Maße, alte/fehlende/falsche Zuschnittattribute und Legacy-Konfigurationen geprüft. Pflichtfeld/Marker tatsächlich gerendert. Das ist eine UI-Sperre, keine Shopify-Servervalidierung.
- Vollständige Cartklasse mit originaler Gruppenlogik/fetchConfig: Gruppenkeys aus gerendertem Mengenmarkup; Entfernen von Haupt- oder Servicezeile sendet beide Keys an /cart/update.js. Einzelartikel/Mengenänderung gehen über /cart/change.js. Drawer-/Cart-Sectionpfad und Checkoutmarker im Adapter geprüft.
- Vollständiger Zuschnittabgleich: fehlende Attribute setzen, alte entfernen, sonstige erhalten, falsche Texte ersetzen, korrekter Zustand ohne Write. GET-/POST-503 und nicht übernommener HTTP-200-Write bleiben gesperrt. Expliziter Retry erholt die Queue; zwei Aufrufe führen nacheinander zu GET/POST/GET mit nur einem Write. Eigene cart:update-Ereignisse erzeugen keine Schleife. Liquid-Sperre nach erfolgreichem Abgleich entfällt.

## TP-010 / P2

Sechs lokale Fehlerfälle bestätigen fehlende Rücknahme der optimistischen Löschung. Gruppen-/Einzellöschung blendet Zeilen aus, letzte Gruppe ersetzt den Cart durch die leere Ansicht. Bei abgelehnter Mutation oder Netzwerkfehler kommt kein Restore/Section-Reload/Cart-Event. Fehlertext liegt in entfernter Zeile oder nur in Console. Auch nach Fehler endende Animation entfernt die Positionen weiterhin. Im Fehlerfixture bleibt der Servercart ausdrücklich unverändert; kein heutiger Shopify-Ausfall behauptet.

Vollständiger Implementation Brief in ISSUES.md. Kein Fix, kein zusätzliches READY-Pack. Aktuelle Browser-/Live-Reichweite H-012 offen.

## Tests und Grenzen

`node --test --test-concurrency=1 qa/tests/cart-gruppen.test.mjs qa/tests/cart-mengensperre.test.mjs qa/tests/cart-waisen.test.mjs qa/tests/zuschnitt-abgleich.test.mjs`: 47 PASS, keine Fehler/Skips. Log cart-core-unit-tests-2026-09-21.log. Diese Tests enthalten Strukturprüfungen; sie allein beweisen kein vollständiges Rendering.

`node --check audit/scripts/reproduce-cart-core.mjs` und erster Diagnoseversuch bestanden. Zweiter Lauf nach Modellierung der tatsächlichen Fehlercontainer-Zeilenhierarchie und zwei verspäteten Animationsfällen ebenfalls bestanden. cart-core-2026-09-21.json enthält Originaldaten, Requestfolgen und Beobachtungen. PASS bedeutet Diagnose einschließlich TP-010, nicht reparierter Shop.

LiquidJS: nur doc/stylesheet entfernt, Icons/Übersetzung/Variantenzählfilter adaptiert. Originale Cart-/Selektorklassen, Gruppencode und Zuschnittasset ausgeführt. DOM/Component-Refs, Section-Morph/DOMParser, Animation und Serverantworten modelliert. Echte MutationObserver-Referenzaktualisierung und CSS-Zeiten nicht geprüft. Fehlerreferenzen bleiben im Adapter an abgetrennten Zeilen; ein echter Browser kann sie zusätzlich verlieren. Kein echter Pointer-/Keyboard-/Form-/Express-Checkoutnachweis, keine heutige MAIN-Verifikation. Sämtliche Fixtureprodukte/IDs/Gruppen/Antworten synthetisch. Alte Preisdiagnosen und Evidence S01–S07 unverändert.

Nächster Schritt CART-002b: Mengenereignis vom Originalselektor über Debounce zum Cart, schnelle Aktionen/Antwortreihenfolge und Section-/Draweraktualisierung. Echte Wiederöffnung/Reload/Checkout anschließend separat nachweisen. Keine bereits abgeschlossenen Preisraster erneut ausführen.
