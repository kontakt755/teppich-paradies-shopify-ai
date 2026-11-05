## 2026-11-05 · „Muster anrufen“ heißt jetzt „Kunden nach Produkt fragen“ und zeigt seine Zahl im Menü

- **Geaendert:** Der Menüpunkt steht direkt unter Packstation, heißt „Kunden nach Produkt fragen“ und zeigt, wie viele Kunden jetzt dran sind. Die Zahl zählt alle offenen Kunden, egal ob Anruf oder Mail, sie lädt schon auf der Startseite.
- **Getestet:** `npm run -s pruefen` alle 11 Schritte. Sichtprüfung mit Datenkopie bei 1440 und 390 px: Menü zeigt den neuen Namen und die Zahl 24 schon auf Heute, Knopf auf der Packstation führt hin, 0 JS-Fehler, 0 px Überlauf.
- **Risiken/Annahmen:** Die Route bleibt `tab=anrufe`, damit vorhandene Links weiter gehen. Am Handy bleibt der Punkt unter „Mehr“, die untere Leiste hat keinen Platz; auf der Packstation führt ein Knopf direkt hin.
- **Nächste Stufe:** keine.
