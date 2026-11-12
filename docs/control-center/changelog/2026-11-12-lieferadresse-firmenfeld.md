## 2026-11-12 · Lieferadresse zeigt Firma und Postnummer

- **Geaendert:** Die Bestellabfrage lädt das Feld „Firma“ der Liefer- und Rechnungsadresse mit. Anzeige, „Adresse kopieren“ und Adressaufkleber führen es als Zeile vor der Straße. Bei Packstationen steht dort die Postnummer; ohne sie stellt DHL nicht zu (ein Musterbrief ging so verloren).

- **Getestet:** `npm run -s pruefen`, neuer Test in `operations/tests/bestelluebersicht.test.mjs`.

- **Risiken/Annahmen:** Der Zusatz fährt im Feld `strasse` mit (keine Änderung an den Ansichten nötig). Bestehende Bestellungen bekommen ihn mit dem nächsten Datenabgleich.

- **Nächste Stufe:** Eigenes Feld, falls nach Firma gefiltert werden soll.
