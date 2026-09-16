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
