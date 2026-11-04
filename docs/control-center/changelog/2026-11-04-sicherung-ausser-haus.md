## 2026-11-04 · Sicherung: verschluesselte Kopie in der Dropbox, rotes To-do bei Ausfall

- **Geaendert:** Neues Skript `operations/scripts/sicherung-ausser-haus.mjs` und Dienst (taeglich 23:00 Uhr): neuestes Tagesarchiv mit gpg (AES-256) verschluesseln, im Dropbox-Ordner ablegen, zurueck entschluesseln und Pruefsumme vergleichen, 14 Tage Frist. Schluessel im Schluesselbund. Auf „Heute“ neues rotes To-do „Sicherungskopie in der Dropbox fehlt“ bei Fehlschlag oder ueber 48 Std. ohne Kopie.
- **Getestet:** `npm run -s pruefen`; `operations/tests/sicherung-ausser-haus.test.mjs` (Verschluesselung, Wiederherstellung, falscher Schluessel, Aufraeumen, Stand) und Fall in `docs/ai-dashboard/tests/todos.test.mjs`. Die Oberflaeche zeigt nur eine neue To-do-Art, keine neue Ansicht.
- **Risiken/Annahmen:** Der Schluessel liegt nur im Schluesselbund dieses Macs. Ohne zweite Ablage ist die Kopie nach einem Totalausfall nicht lesbar; das erledigt der Inhaber. Ein Rechner ohne Stand-Datei bekommt kein To-do.
- **Nächste Stufe:** Nach dem Merge den Dienst mit `dienste-einrichten.sh --nur-sicherung` auf das Repository umstellen.
