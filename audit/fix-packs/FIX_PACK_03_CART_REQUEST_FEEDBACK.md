# FIX_PACK_03_CART_REQUEST_FEEDBACK

Status: READY zur späteren lokalen Übergabe, keine Umsetzungs-/Livefreigabe. Gesamt-Audit weiterhin Phase 1. Zwei zusammenhängende P3-Issues; kein künstlich erweitertes Sammelpaket.

## CLAUDE CODE TASK

Lies TASK.md einschließlich WATCHDOG EXECUTION OVERRIDE, AGENTS.md, audit/MASTER_STATUS.md, audit/ISSUES.md (TP-013/014 einschließlich S15-/S16-Ergänzungen), audit/TEST_MATRIX.md und audit/DEPENDENCY_MAP.md. Lies danach assets/cart-discount.js, assets/cart-note.js und snippets/cart-summary.liquid sowie die drei unten genannten Diagnosen/Evidences.

Beginne erst nach ausdrücklicher Beauftragung dieses Pakets. Arbeite sequenziell ohne Subagenten ausschließlich an TP-013/014. Keine Refactorings, Funktionsentfernung oder Shop-/Produktdatenänderung. Gleiche aktuelle Quellen vor Änderung ab. Eine abweichende Livequelle darf nicht ungeprüft überschrieben werden; MAIN vor einer späteren Liveaktion frisch verifizieren. Die Browserablehnung aus S13 nicht umgehen.

Implementiere kleine getrennte Schritte, teste jeweils das Sollverhalten und dokumentiere Ergebnisse in audit/fix-results/FIX_PACK_03_CART_REQUEST_FEEDBACK_RESULT.md: Dateien/Funktionen, erledigte/nicht erledigte Issues, neue Beobachtungen, Tests/Resultate und verbleibende Risiken. Kein Merge/Publish/Shopify-Write durch READY autorisiert. Fehlende Browserabnahme ausdrücklich als offen ausweisen.

## ZIEL

Rabattübertragungsfehler verständlich anzeigen und sicherstellen, dass alte asynchrone Abschlüsse keine Controllerreferenz einer neueren Aktion löschen.

## BETROFFENE ISSUES / PRIORITÄT

TP-013/P3: Apply und Remove verschlucken Übertragungs-/Parsefehler. TP-014/P3: unbedingtes finally-Cleanup verliert neuere Controllerreferenz; auch lokal deaktivierte CartNote betroffen. Kein behaupteter Nachweis einer falschen Shopify-Abrechnung oder verlorenen Bestellnotiz.

## BETROFFENE DATEIEN

assets/cart-discount.js (applyDiscount, removeDiscount, Controller/Fehlerhandler); assets/cart-note.js ausschließlich Controllerownership. snippets/cart-summary.liquid und passende Locale-Datei nur soweit für einen generischen Rabattfehlertext notwendig. Gezielte Verhaltenstests, Ergebnisdatei. Keine Änderung an settings_data.json.

## ABHÄNGIGKEITEN / PARALLEL SAFE

PARALLEL SAFE: NO. FILE CONFLICT: TP-013/014 teilen cart-discount.js; CartNote könnte später eigene Persistenz-/Disconnect-Fixes erhalten. Keine parallel freigegebenen Pakete. Abschnittsaktualisierung nutzt DiscountUpdateEvent und morphSection; TP-012 und H-013 bleiben getrennte Renderer-/Antwortprobleme. Dieses Paket repariert keine globale Requestqueue und keine Server-Commitreihenfolge.

Notizschalter lokal false; Konfigurationshash weicht vom historischen Live-Snapshot ab. Nicht aktivieren. Eine Ownershipkorrektur in der vorhandenen Klasse ist Teil dieses Pakets, aber keine Freigabe des optionalen Features.

## NICHT VERÄNDERN

Preise, Rabattregeln/-codes, Versand/Steuer, Checkout-Einstellungen, Produktvarianten/SKUs, Paket-/Gruppen-/Zuschnittlogik, globale Events oder fetchConfig/debounce. Keine automatische Write-Retryschleife. Notiz-UI, 200-ms-Intervall und name=note/form=cart-form erhalten; keine unbelegte Persistenz-Neuarchitektur.

## UMSETZUNGSREIHENFOLGE

1. Aktuelle Quellen mit S14–S16 vergleichen; gezielte Tests auf Sollverhalten vorbereiten.
2. TP-014 Ownership in Rabatt und Notiz minimal korrigieren; Abbruchregression prüfen.
3. TP-013 echte Rabattfehler behandeln, erwartete Abbrüche von Fehlern unterscheiden; Apply und Remove testen.
4. Betroffene Integration/Fokus/Fehleransage prüfen, soweit Browserzugriff erlaubt; Ergebnis und Grenzen dokumentieren.

## ISSUE-BY-ISSUE IMPLEMENTATION BRIEF

TP-014: finally darf #activeFetch nur löschen, wenn die Referenz noch zum eigenen Controller gehört. Einen überholten Antwortabschluss nicht als aktuelle Aktion anwenden. Client-Abort nimmt serverseitige Writes nicht zurück. Seiteneffekte: klemmende Referenz, veralteter Morph, doppelte Events; jede Änderung anhand kontrollierter A/B/C-Reihenfolge testen. Aufwand S–M, kleine Codeänderung rücknehmbar.

TP-013: HTTP-Status/Antwortstruktur und Parse-/Netzfehler sinnvoll unterscheiden; generische kundengerechte Meldung statt leerem catch. Code für Retry erhalten. Erwarteter Abort darf keine neue Fehlermeldung über eine neuere Aktion schreiben. Vorhandene spezifische Code-/Shipping-Meldungen erhalten. Aufwand S–M; Locale-/Markupänderung nur für benötigtes Feedback. Root Cause und vollständige Briefs in ISSUES.md sind Bestandteil dieser Übergabe.

## AKZEPTANZTESTS

- Netzwerkfehler, 500-JSON ohne discount_codes, ungültiges JSON: sichtbarer Rabattfehler; kein falscher Erfolg, eingegebener Code bleibt erhalten, expliziter Retry erfolgreich.
- Remove: Fehler sichtbar, bestehender Code bis bestätigtem Erfolg erhalten; Entfernen eines von zwei und des letzten Codes korrekt.
- A starten, B bricht A ab, A.finally abwarten, C starten: B wird weiterhin durch C abgebrochen. Für Apply→Apply→Apply und Remove→Apply→Apply sowie Notizfolge prüfen.
- Älterer Abschluss überschreibt keinen neueren Fehler-/Erfolgszustand. Normale sequentielle Aktionen senden erwartetes Event und Sectionupdate.
- Notiz: leere/Unicode-Eingabe, letztes Burstfeld nach 200 ms, Formularzuordnung unverändert; keine Aktivierung.

## REGRESSIONSTESTS

Gezielte Basis: audit/scripts/reproduce-discount-errors.mjs, reproduce-discount-concurrency.mjs und reproduce-cart-note.mjs; JSON-Evidence in audit/evidence/discount-errors-2026-09-22.json, discount-concurrency-2026-09-22.json, cart-note-2026-09-22.json. Diese Skripte bestätigen teilweise fehlerhaftes Istverhalten: für Fix-QA eigene Sollassertions ergänzen, historische Evidence nicht überschreiben.

Gültiger/ungültiger/Shipping-Code, mehrfaches Absenden, Abbruch ohne Fehlalarm, Cartseite/Drawer und zugängliche role=alert-Meldung. Native Checkout-/Serverprüfung bleibt erforderlich, falls Ergebnis über lokalen Scope hinaus beansprucht wird. Keine echten Käufe, keine Preis-/Rabattkonfigurationsänderungen.

## ABSCHLUSSCHECK

Diff nur im Scope; gezielte Tests PASS; Secret-Scan und sinnvolle Themechecks bei Markupänderung; Ergebnisse samt Browsergrenzen dokumentiert. TP-014 nur vollständig melden, wenn beide Klassen geprüft sind; sonst Teilstatus. Kein QA PASSED für ungeprüfte Liveintegration. Keine Veröffentlichung ohne konkrete Freigabe.
