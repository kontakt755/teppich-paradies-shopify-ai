## 2026-11-04 · Meldungen fangen keine Klicks mehr ab, Musterlager-Summe je Art

- **Geaendert:** Eingeblendete Meldungen lassen Klicks durch, nur der Knopf "Melden" nimmt sie an. Ausnahme: Bei offenem Dialog, Aufgabenblatt oder offener Suche bleiben sie klickfest, sonst schloesse der Klick auf die Meldung das Fenster samt Eingaben. Bei offenem Dialog stehen sie auch am Rechner oben, und es stehen hoechstens drei gleichzeitig da. Die Summe je Lieferant im Musterlager nennt Einzelmuster, Probestuecke, Bahnen und Verlegereste getrennt.
- **Getestet:** `npm run -s pruefen`; Test fuer die Summe; Klicktest durch eine Meldung im Browser, Klick auf die Meldung bei offenem Dialog, Blatt und Suche.
- **Risiken/Annahmen:** Meldungstext laesst sich ohne offenes Fenster nicht mehr markieren. Bei offenem Dialog, Blatt oder Suche kann eine Meldung weiter etwas darunter verdecken, bis sie verschwindet. Eine vierte Meldung verdraengt die aelteste.
- **Naechste Stufe:** keine.
