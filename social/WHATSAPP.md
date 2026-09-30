# WhatsApp-Gruppe als Auffangnetz

Hauptweg für Baustellenfotos bleibt der persönliche Upload-Link: Originalqualität,
Angaben, Häkchen für die Einwilligung. Was die Monteure trotzdem nur in die
Firmengruppe schicken, übernimmt der Takt alle 15 Minuten aus der WhatsApp-App
auf dem Betriebsrechner (`lib/whatsapp.mjs`).

- Gelesen wird nur lokal: eine Kopie der Chat-Datenbank und der Medienordner
  der Mac-App. Kein Bot, keine Verbindung zu WhatsApp, nichts wird dort
  verändert – die Firmennummer ist nicht gefährdet.
- Übernommen werden nur Fotos und Videos **dieser einen Gruppe**, keine Texte,
  keine anderen Chats.
- Je Absender wird daraus eine Baustelle. Nach mehr als drei Stunden Pause
  beginnt eine neue. Übernommen wird drei Stunden nach dem letzten Bild –
  vielleicht kommen noch weitere.
- Beim ersten Lauf nur die letzten 14 Tage, nicht das ganze Archiv der Gruppe.
- Übernommen wird nur, was WhatsApp auf dem Mac **heruntergeladen** hat. Ein
  frisch verknüpfter Mac holt ältere Fotos erst, wenn jemand die Gruppe dort
  öffnet und durchscrollt. Auf fehlende Dateien wartet das System drei Tage
  (ab der Nachricht bzw. ab dem ersten Lauf), danach werden sie übersprungen.
- Absender: WhatsApp zeigt Gruppenmitglieder heute nur noch über anonyme
  Kennungen. Einen Namen gibt es, wenn der Kontakt im Adressbuch des
  verknüpften Handys steht; sonst erscheint „Mitglied …1234“ (letzte Ziffern
  der Kennung).
- Doppelte Bilder (dasselbe Foto per Link und per WhatsApp) sortiert die
  Bildprüfung aus.

## Grenzen

| | Upload-Link | WhatsApp-Gruppe |
|---|---|---|
| Bildqualität | Original | von WhatsApp verkleinert (meist 1600 px, reicht für Beiträge) |
| Ort, Boden, Raum | vom Monteur angetippt | fehlen – die Redaktion trägt nach, was das Bild eindeutig zeigt |
| Einwilligung | Häkchen beim Upload | **fehlt** – der Inhaber bestätigt sie in der Zentrale |

Ohne bestätigte Einwilligung lässt sich nichts freigeben. In der Zentrale steht
dafür am Material und am Entwurf der Knopf **„Einwilligung liegt vor“** – nur
drücken, wenn der Auftragszettel das Kreuz trägt.

## Einrichten (einmalig, am Mac mini)

1. **WhatsApp für Mac** ist installiert und mit dem Firmenhandy verbunden; die
   Gruppe ist dort sichtbar. Unter Einstellungen → Speicher und Daten das
   automatische Herunterladen von Fotos (und Videos) einschalten.
2. **Festplattenvollzugriff für node** – macOS schützt die Daten jeder App.
   Systemeinstellungen → Datenschutz & Sicherheit → Festplattenvollzugriff →
   „+“ → im Dateidialog ⌘⇧G und den Pfad einfügen, den dieser Befehl ausgibt:

   ```
   readlink -f "$(command -v node)"
   ```

   Hinzufügen, Schalter an. Danach gilt der Zugriff für jedes Node-Programm auf
   diesem Rechner – bewusst so entschieden (30.09.2026). Nach einem
   `brew upgrade node` ändert sich der Pfad: den neuen Eintrag hinzufügen,
   den alten entfernen.
3. **Gruppe eintragen** in `~/teppich-paradies-analyse/social/zugang.env`
   (Name exakt wie in der App):

   ```
   SOCIAL_WHATSAPP_GRUPPE=Name der Gruppe
   ```

4. Prüfen – zeigt nur, was da ist, übernimmt nichts:

   ```
   npm run social -- whatsapp --pruefen
   ```

   Danach übernimmt der Takt von selbst; sofort geht es mit
   `npm run social -- whatsapp`.

## Störungen

| Meldung (im `takt.log`) | Abhilfe |
|---|---|
| „macOS verweigert den Zugriff“ | Schritt 2, auch nach einem Node-Update |
| „Gruppe … nicht gefunden“ | Name in `zugang.env` genau wie in der App (Groß-/Kleinschreibung, Emojis) |
| „Keine WhatsApp-Daten“ | WhatsApp für Mac starten und anmelden |
| „noch nicht heruntergeladen“ bei `--pruefen` | Gruppe in WhatsApp auf dem Mac öffnen und durchscrollen; automatisches Herunterladen einschalten. Nach drei Tagen ohne Datei wird ein Foto übersprungen |
| Absender „Mitglied …1234“ | Kontakt im Adressbuch des verknüpften Handys anlegen – wirkt für künftige Übernahmen |

`whatsapp-stand.json` im Datenverzeichnis merkt sich, was übernommen ist. Wer
es löscht, bekommt beim nächsten Lauf die letzten 14 Tage noch einmal –
schon übernommene Baustellen entstehen dabei nicht doppelt.

Das Schema der WhatsApp-Datenbank ist nicht dokumentiert. Gelesen werden nur
wenige Tabellen; ändert die App sie, meldet `whatsapp --pruefen` einen Fehler,
statt still falsch zu übernehmen.
