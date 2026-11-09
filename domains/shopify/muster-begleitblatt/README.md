# Begleitblatt für den Musterumschlag (A4)

Ein A4-Blatt, das in jeden Musterumschlag kommt, den wir selbst packen: persönliche Anrede,
drei Schritte bis zur Bestellung, je Muster ein QR-Code auf genau diese Farbe, dazu WhatsApp
und Telefon. Es soll mehr Musterkunden zum Warenkauf bringen. Bewusst ohne Produktfotos (die
Farbe prüft der Kunde am echten Muster), ohne gedruckte Preise (sie ändern sich) und ohne Rabatt.

## Drucken

Control Center, **Packstation**, Reiter **Bestellung packen**:

- je Umschlag **Begleitblatt drucken**, immer direkt unter dem Kopf des aufgeklappten Umschlags
- über der Liste **Begleitblätter drucken (N)** für alle gezeigten, noch nicht gepackten Umschläge, in Packreihenfolge
- vergessen? Reiter **Erledigt**, **Begleitblatt nachdrucken**: auch nach dem Versand, gemeinsam gepackte Bestellungen auf einem Blatt

Das PDF öffnet in einem neuen Tab. Beide Seiten bei 4 und mehr Mustern gehören in denselben Umschlag.
Direktversand vom Hersteller bekommt kein Blatt.

## Wo was liegt

- `vorlage.mjs`: Texte, Aufbau, Auswahl (Boden oder Teppich nach Maß, nah oder fern), Prüfung der Kaufseite
- `pdf.mjs`: Druck über Chromium (Bausteine aus `../ratgeber-pdf`, auch Logo und Schrift); braucht `qrencode`
- `/api/kunden/muster-begleitblatt?nummern=1091,1102`: rein lesend, in `scripts/dashboard-api.mjs`
- Gestaltet wurde das Blatt im Claude-Canvas. Maßgeblich ist seit dem Einbau `vorlage.mjs`.

## Regeln im Blatt

- **QR-Code je Muster:** die Seite und Farbe, von der das Muster bestellt wurde (`_Quellprodukt`,
  `_Quellvariante_ID` der Bestellposition), geprüft gegen das Lexikon (`lexikon/produkte.json`, kein Abruf beim
  Druck). Ist die Farbe nicht verfügbar oder passt sie nicht, gibt es für diesen Umschlag kein Blatt, und die Packstation sagt warum: Ein QR-Code
  auf eine tote Seite wäre schlimmer als kein Blatt.
- **Gesperrte Muster** kommen nicht in den Umschlag und stehen deshalb nicht auf dem Blatt.
- **In Ihrer Nähe:** nur, wenn die ganze Postleitzahl laut `assets/tp-verlegegebiet-orte.json` innerhalb von
  50 km liegt, weil dort „Aufmaß kostenlos“ zugesagt wird. Sonst „Wir liefern deutschlandweit“.
- **Google-Note:** aus dem Monatslauf (`$TP_PRIVAT_DIR/google-bewertung/status.json`, dieselben Zahlen wie
  im Shop). Fehlt der Stand, entfällt die Zeile. Der Satz „Wir prüfen nicht, ob die Verfasser bei uns gekauft
  haben.“ (§ 5b UWG) steht immer direkt darunter und wird nicht entfernt.
- **WhatsApp-Nummer:** aus `$TP_PRIVAT_DIR/muster-begleitblatt/einstellungen.json`
  (`{ "whatsapp": "0151 2345678" }`, nie im Repository). Ohne Datei gilt die Firmennummer aus dem Shop.
- **Text passt nicht:** Ein langer Name wird kleiner. Reicht das nicht, wird der Umschlag nicht gedruckt und gemeldet.

Kundendaten stehen nur im erzeugten PDF. Es wird nicht gespeichert.
