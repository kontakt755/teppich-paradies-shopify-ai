## 2026-11-09 · Packstation: Begleitblatt kommt mit dem Aufkleberdruck (#2053)

- **Geaendert:**
  - **Aufkleber und Adresse drucken** (Schritt 1 im Umschlag, auch unter „Mehr …“ und „Adressaufkleber drucken“ in Schritt 3) öffnet im selben Klick das A4-Begleitblatt als PDF in einem neuen Tab, neben dem Druckdialog des Niimbot. Anlass: am 09.11. beim Packen einer Doppelbestellung vergessen.
  - „Alle Packbereiten drucken“ und „Diese Umschläge vorbereiten“: ein gemeinsames PDF für alle Umschläge.
  - Kein Blatt bei Direktversand, bei „Nur diesen nachdrucken“, „Alle Aufkleber erneut drucken“ und im Bereich Gepackt. Kann das Blatt nicht erstellt werden, läuft der Aufkleberdruck trotzdem, die Packstation meldet „Kein Begleitblatt: …“.
  - „Begleitblatt drucken“ im Umschlag und „Begleitblatt nachdrucken“ im Reiter Erledigt bleiben für den Nachdruck. Hilfe und `domains/shopify/muster-begleitblatt/README.md` angepasst.
- **Getestet:** neuer Test in `tests/dashboard-abschlusskorrekturen.test.mjs` (Einzelklick öffnet einen Tab und ein Blatt, Nachdruck und Direktversand ohne Blatt; Vorbereiten mehrerer Umschläge ein PDF), `npm run dashboard:test` grün, `npm run -s pruefen` 11/11, `npm run dashboard:pruefen` 200 OK-Zeilen. Klickstrecke gegen die Datenkopie: ein Klick auf „Aufkleber und Adresse drucken (3)“ → Aufkleberdialog offen und neuer Tab mit PDF (`/api/kunden/muster-begleitblatt` 200, application/pdf).
- **Risiken/Annahmen:** Der PDF-Tab schiebt sich vor die Packstation; nach dem Drucken des Blatts zurück zum Tab und die Aufkleber drucken. Doppelseitig druckt der Epson ET-8500 von selbst.
- **Naechste Stufe:** Keine.
