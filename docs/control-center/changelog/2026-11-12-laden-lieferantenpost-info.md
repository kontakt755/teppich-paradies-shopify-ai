## 2026-11-12 · Ansicht Laden: Lieferantenpost ist nur Info

- **Geaendert:** Mails von Lieferanten der privaten Stammdaten (Auftragsbestaetigungen, Avise) stehen in der Spalte „Mails“ als reine Info: nie rot, kein „Übernehmen“, nur der Knopf „Gesehen“ (blendet die Zeile aus, am Postfach aendert sich nichts). Bisher galten sie als unbeantwortet und wurden nach einem Werktag rot - am ersten Tag mit echtem Postfach waren 15 von 22 Mails rot, rund die Haelfte davon Lieferantenpost. Eine Antwort des Lieferanten auf unsere Mail (Betreff beginnt mit Re:/AW:/WG:) bleibt eine normale Mail und wird rot.
- **Getestet:** `docs/ai-dashboard/tests/laden.test.mjs` (neuer Test), `npm run -s pruefen`.
- **Risiken/Annahmen:** Eine neue Frage eines Lieferanten ohne „Re:/AW:“ im Betreff steht ebenfalls als Info da. Ohne Lieferantenliste aendert sich nichts.
- **Naechste Stufe:** Unzustellbar-Meldungen und Testmails aus der Spalte nehmen.
