## 2026-11-04 · Kundenakte: keine E-Mail mehr in Links

- **Geaendert:** Links zur Kundenakte und zu Kundenfaellen tragen statt E-Mail, Telefon oder Name einen Kurzwert (`k-…`, `lib/kunden-linkwert.mjs`). Der Dienst loest ihn auf und nennt den echten Schluessel; Notizen, Faelle und Aufgaben haengen weiter daran. Alte Links oeffnen weiter und werden in der Adresszeile umgeschrieben.
- **Getestet:** `npm run -s pruefen`, `npm run dashboard:test`; neue Tests fuer Kurzwert, Vorgangslink und Akte ueber den Kurzwert.
- **Risiken/Annahmen:** Der Kurzwert ist kein Geheimnis: Wer eine Adresse kennt, kann ihn nachrechnen. Eintraege im vorhandenen Browserverlauf bleiben. Die Notiz-Abfrage der Akte nennt den Schluessel weiter in der Anfrage an den eigenen Dienst, nicht in der Adresszeile.
- **Naechste Stufe:** keine.
