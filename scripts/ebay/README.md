# eBay einstellen

`einstellen.py` stellt Teppichboden aus der privaten Startliste über die eBay Inventory API ein.
Es gibt Einkaufspreise und Lieferanten nie weiter und sendet nichts ohne ausdrücklichen Schalter.

## Einrichten (einmalig, durch den Inhaber)

1. Konto im eBay-Entwicklerprogramm und App-Schlüssel anlegen; die Befreiung von den Kontolöschungs-Meldungen beantragen. Benutzer-Token mit den Berechtigungen `sell.inventory` und `sell.account.readonly` erzeugen.
2. `ebay-zugang.env` im Privatordner ausfüllen: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REFRESH_TOKEN`. Nie in den Chat oder ins Repository.
3. Im Verkäufer-Cockpit die Rahmenbedingungen aktivieren und je eine für Versand, Zahlung und Rücknahme anlegen.
4. `ebay-konfig.json` im Privatordner ausfüllen:

```json
{
  "fulfillmentPolicyId": "",
  "paymentPolicyId": "",
  "returnPolicyId": "",
  "merchantLocationKey": "lager-oranienburg",
  "standort": {"city": "", "postalCode": ""},
  "versand_gls_kosten": 0,
  "versand_spedition_kosten": 0,
  "versand_xxl_kosten": 0,
  "stueck_mindestmarge": 0,
  "marke_ersatz": "",
  "menge_bestellware": 0,
  "kategorie_teppichfliesen": ""
}
```

5. `--rahmen-zeigen --umgebung produktion` zeigt die drei IDs für die Konfiguration.
6. `--standort-anlegen --umgebung produktion` legt den Artikelstandort bei eBay an. Das ist nur einmal nötig.

## Ablauf

Für den Probelauf braucht das Skript `openpyxl` (`~/.venvs/analyse/bin/python`).

| Schritt | Befehl | Wirkung |
|---|---|---|
| Probelauf | `--welle 1` | kein Netz, Plan, Mischpreis und Mängel |
| Testkonto | `--welle 1 --senden` | ein Entwurf in der Sandbox |
| Echtes Konto | `--welle 1 --senden --umgebung produktion` | ein Entwurf, Gebühren im Protokoll |
| Veröffentlichen | zusätzlich `--veroeffentlichen --rechtlich-geklaert` | ein Angebot live |
| Mehr | zusätzlich `--max 10` | höchstens so viele je Lauf |

Ein erneuter Lauf aktualisiert vorhandene Angebote und legt keine Doppel an.

## Sperren

- Rolle ohne Einkauf oder unter der Zielmarge
- Angebote mit einem Namen aus der Lieferantenliste
- Produkte ohne Marke, Bild oder passende Kategorie
- Fehlende Rahmenbedingungen, Zugänge oder Namensliste

## Sonderposten: Längen und Mischpreis

Jede Rolle wird ein Angebot mit Längen von 1,00 bis 6,00 m in 20-cm-Schritten. Alle Längen haben denselben Preis je m² und kostenlosen Versand. Das Skript hebt den Preis bei Bedarf so weit an, dass

- der Schnitt über alle Längen die Zielmarge erreicht,
- kein Stück unter `stueck_mindestmarge` fällt.

Der Schnitt zählt jede Länge gleich. Er sagt also nichts darüber, welche Längen wirklich gekauft werden.

Den Versandweg bestimmt die kürzere Seite: bis 200 cm GLS, bis 320 cm Spedition, darüber Spedition XXL.

Die Stückzahl jeder Länge wird aus Bestand und Restlänge gerechnet. Nach Verkäufen den Bestand in der Startliste anpassen und das Skript erneut laufen lassen; eBay senkt die anderen Längen nicht von selbst.

## Hinweis zur Schnittware

Jede Beschreibung trägt den Text aus `HINWEIS_ZUSCHNITT`: alles Zuschnitte, keine Fertigmaße. Das folgt dem Rat des Anwalts. Die Rücknahme-Rahmenbedingung im Verkäufer-Cockpit muss dazu passen; das Skript setzt sie nicht.

## Einzelmaß auf Anfrage

Für andere Maße oder über 6 m entsteht ein einmaliges Angebot:

`--einzelmass "Name der Rolle" --breite-cm 400 --laenge-cm 700 --preis 700 --frachtkosten 150`

Es zählt nicht automatisch gegen den Rollenbestand der anderen Längen.
