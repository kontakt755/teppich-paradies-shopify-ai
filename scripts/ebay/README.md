# eBay einstellen

`einstellen.py` stellt Teppichboden aus der privaten Startliste über die eBay Inventory API ein.
Es gibt Einkaufspreise und Lieferanten nie weiter und sendet nichts ohne ausdrücklichen Schalter.

## Einrichten (einmalig, durch den Inhaber)

1. Konto im eBay-Entwicklerprogramm und App-Schlüssel anlegen; Benutzer-Token mit Berechtigung `sell.inventory` erzeugen.
2. `ebay-zugang.env` im Privatordner anlegen: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REFRESH_TOKEN`. Nie in den Chat oder ins Repository.
3. Im Verkäufer-Cockpit Rahmenbedingungen für Versand, Zahlung und Rücknahme sowie einen Artikelstandort anlegen.
4. `ebay-konfig.json` im Privatordner anlegen:

```json
{
  "fulfillmentPolicyId": "",
  "paymentPolicyId": "",
  "returnPolicyId": "",
  "merchantLocationKey": "",
  "marke_ersatz": "",
  "menge_bestellware": 0,
  "kategorie_teppichfliesen": ""
}
```

## Ablauf

Für den Probelauf braucht das Skript `openpyxl` (`~/.venvs/analyse/bin/python`).

| Schritt | Befehl | Wirkung |
|---|---|---|
| Probelauf | `--welle 1` | kein Netz, Plan und Mängel |
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

Fertigmaße sind nicht enthalten: Preis, Widerruf und der gemeinsame Rollenbestand sind noch offen.
