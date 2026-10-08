# Was die vier Bestelldokumente zeigen - und was nicht

Stand 2026-09-16, alles am lebenden Shop nachgemessen.

| Dokument | Produkttitel | Variante | SKU | Line-Item-Properties |
|---|---|---|---|---|
| Bestellbestaetigung (Kunde) | ja | ja | – | **ja** |
| Interne Bestellmail (Mitarbeiter) | ja | ja | ja | **ja** |
| Kommissionierliste | ja | ja | ja | – (Spaltenwahl, kein Liquid) |
| Lieferschein | ja | ja | ja | **nein - siehe unten** |
| Rechnung | ja | ja (seit 2026-09-16) | ja (seit 2026-09-16) | nein |

## Der Lieferschein kennt `line_item.properties` nicht

`{% if line_item.properties %}` liefert dort **NIL**, nicht ein leeres Array.
Gemessen mit einer Sonde in der Vorlage:
`PROPTEST[{% if line_item.properties %}VORHANDEN{% else %}NIL{% endif %}|{{ line_item.properties.size }}]`
rendert `PROPTEST[NIL|]`. Waere das Feld vorhanden und nur leer, stuende dort
`PROPTEST[VORHANDEN|0]`.

**Die Vorschau taugt dafuer nur bedingt als Beleg**: sie rendert eine
Dummy-Bestellung #9999 mit Beispielartikeln, die selbst keine Properties
tragen. Der NIL-Befund ist trotzdem aussagekraeftig, weil ein vorhandenes
Feld auch ohne Werte als leeres Array erschiene.

Praktische Folge: **Konfigurationsangaben, die nur in Properties stehen
(Masse, Kante, Flaeche bei Rollenware), erscheinen nicht auf dem Lieferschein.**
Wer sie dort braucht, muss sie zu Artikeldaten machen - so wie es bei den
Mustern geschehen ist (siehe `musterartikel.md`). Die Properties-Schleife
bleibt in der Vorlage stehen: sie richtet keinen Schaden an und greift
automatisch, falls Shopify das Feld nachreicht.

## Die Vorschau der Vorlagen

Admin → Einstellungen → Versand und Zustellung → Dokumente → **Vorlagen**
(Lieferschein / Kommissionierliste / Rechnung). Die Vorlagen liegen unter
`/settings/shipping/templates/<id>` - die IDs nicht abschreiben, sondern ueber
die Liste ansteuern.

Der CodeMirror-Editor verhaelt sich wie bei den Benachrichtigungsvorlagen:
Aenderungen per `cmView.view.dispatch` erscheinen sofort in der Vorschau, aber
die Speicherleiste erscheint erst, wenn **im Editorfeld selbst** getippt wurde
(klicken, ein Zeichen, Backspace). Siehe `shopify_admin_notification_templates`
in den Notizen.

## Rechnung: Pflichtangaben nach § 14 UStG (2026-10-05)

Die Vorlage "Rechnung" ist der Download, den Kunden im Kundenkonto bekommen;
im Admin gibt es dafuer keinen Druckknopf (Bestellliste → Drucken bietet nur
Lieferscheine). Ergaenzt per Admin-Editor:

- Absender mit vollem Firmennamen "Teppich Paradies Oranienburg GmbH" statt
  `shop.name`, darunter USt-IdNr. und Handelsregister (Werte wie Impressum).
- Kopf: Rechnungsnr. (`order.order_name` ohne `#`), Rechnungsdatum
  `%d.%m.%Y`, Leistungsdatum "entspricht dem Rechnungsdatum".
- Steuerzeile statt "Steuer": "Enthaltene MwSt. <Satz> %" aus
  `order.tax_lines` (ohne tax_lines: 19 %), darunter der Nettobetrag
  (`total_price - tax_price`). Bei Steuer 0 steht nur "MwSt.".

Hintergrund: Die Steuererhebung fuer Deutschland war bis 01./02.10.2026 nicht
aktiv. Bestellungen #1004-#1017 tragen keine Steuerzeile (Shopify rechnet
nicht rueckwirkend); fuer diese Rechnungen braucht es eine manuelle Korrektur.
Ab #1018 steht "DE MwSt 19 %" auf jeder Position.

Ob die Vorschau `order.tax_lines` kennt, ist nicht belegt (die Dummy-Bestellung
#9999 hat Steuer 0). Gegenprobe beim ersten echten Rechnungsdownload einer
Bestellung ab #1018.

Nachtrag 2026-10-05 (zweite Runde):

- Absender: "Sitz: Oranienburg, Geschaeftsfuehrerin: ..." ergaenzt (Pflichtangaben
  fuer Geschaeftsbriefe einer GmbH, § 35a GmbHG; Werte wie Impressum).
- Telefon fest auf die Festnetznummer aus dem Impressum statt `shop.phone`
  (dort steht die Mobilnummer).
- Englische Tabelle "Transaktionsdetails" (authorization/void/success)
  ersetzt durch eine Zeile "Zahlungsart: <gateway_display_name>" aus der ersten
  erfolgreichen sale/capture/authorization-Transaktion.
- Fusszeile in Sie-Form.
- Offen: "Leistungsdatum: entspricht dem Rechnungsdatum" ist sachlich falsch
  (Rechnungsdatum = Bestelldatum, Lieferung spaeter). Formulierung mit dem
  Steuerberater klaeren (Monat der Lieferung oder Verweis auf Lieferschein).

## Shopify-Funktion "Rechnungen mit MwSt." (eingeschaltet 2026-10-05)

Einstellungen → Steuern und Zollgebuehren → Europaeische Union → "Rechnungen mit
MwSt.: Rechnungen erstellen und anzeigen, wenn Bestellungen aufgegeben werden".
Vom Inhaber am 2026-10-05 freigegeben ("die Shopify-Rechnung ist unsere einzige
Rechnung"). Shopify erzeugt damit je Bestellung selbst eine Rechnung mit
Steuerausweis und fortlaufender Nummer und zeigt sie dem Kunden.

- Nicht einschalten bzw. wieder ausschalten, sobald Rechnungen zusaetzlich in
  einem anderen System (z. B. Lexware) geschrieben werden: zwei Rechnungen zur
  selben Bestellung loesen § 14c UStG aus.
- Gilt nur fuer neue Bestellungen; #1004-#1017 (ohne Steuerzeile) bleiben ein
  manueller Korrekturfall.
- Die Vorlage "Rechnung" unter Versand und Zustellung → Dokumente bleibt
  bestehen (siehe oben), ist aber nicht mehr das einzige Rechnungsdokument.
  Bei der ersten neuen Bestellung pruefen, welches Dokument der Kunde sieht
  und ob Firmenname, USt-IdNr. und Steuerausweis darauf stimmen.
- Die Bearbeiten-Seite der Steuerregistrierung Deutschland lieferte am
  2026-10-05 einen 404; die dort hinterlegte USt-IdNr. ist deshalb ungeprueft.
