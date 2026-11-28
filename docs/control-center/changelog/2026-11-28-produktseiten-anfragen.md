## 2026-11-28 · Anfragen von der Produktseite als Service-Anfrage

- **Geaendert:** „Verlegeanfrage“, „Angebotsanfrage“ und „Beratungstermin“ aus dem Kontaktformular
  (`/pages/kontakt?thema=…`) werden gelesen und automatisch übernommen; bisher galten sie wegen
  Formular-Kennung `sample` und Feld `Produkt` als Musteranfrage. Das Produkt steht in der Notiz.
  Reklamation und „Anfrage zum Produkt“ werden weiter abgewiesen, jetzt mit passendem Grund.
- **Getestet:** Neue Tests zuerst rot, dann grün (Parser, Abweisungen, Abgleich mit Theme-Skript und
  Formularfeldern). Feldnamen an einer echten Mail nur lesend geprüft; Testdaten sind ausgedacht.
  `dashboard:pruefen` (Kunden, Service) und Klickstrecke „Formular-Mail einfügen“ gegen die
  Datenkopie bei 1440 und 390 px: Anfragen 13 → 15, Reklamation und Musteranfrage abgewiesen, keine
  JS-Fehler; Übernahme-Skript gegen die Kopie: 1 angelegt, 2 mit Grund übersprungen.
- **Risiken/Annahmen:** „Beratungstermin“ zählt auch, wenn er ohne Verlegung gewünscht ist (Link auf
  der Muster-Seite). Schon geprüfte Mails liest die Übernahme nicht erneut.
- **Nächste Stufe:** keine.
