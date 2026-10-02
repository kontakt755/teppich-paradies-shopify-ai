# Angebotswelle: befristete Preisaktionen

Inhaber 2026-10-02: regelmaessig wechselnde Angebote statt Dauerrabatt. Jede Welle hat
Auswahl, Prozent, Start und Ende; am Ende geht der Preis auf den regulaeren Preis zurueck.

## Ablauf

1. **Auftrag** vom Inhaber: Produkttyp oder Handles, Prozent, Zeitraum
   (z. B. „Teppichboden 15 %, 03.11.–16.11.“).
2. **Export** (Bulk-Abfrage, `npm run -s angebot -- abfrage`) per
   `bulkOperationRunQuery`, Ergebnis-JSONL lokal unter
   `~/teppich-paradies-analyse/angebote/<welle>/export.jsonl`.
3. **Plan:** `npm run -s angebot -- plan export.jsonl <ordner> --prozent 15 --start 2026-11-03 --ende 2026-11-16 --typ Teppichboden`
   → `plan.csv` (zur Freigabe), `ausgelassen.csv` (mit Grund), `varianten.jsonl`,
   `metafelder.jsonl`, `rueckstellen.jsonl`.
4. **Freigabe** des Inhabers anhand von `plan.csv` (Preisaenderung, AGENTS.md).
5. **Schreiben** per `bulkOperationRunMutation`: `varianten.jsonl` mit
   `productVariantsBulkUpdate`, `metafelder.jsonl` mit `metafieldsSet`. Gegenprobe per
   erneutem Export - `userErrors: []` ist kein Beleg (Skill `shopify-massendaten`).
6. **Ende:** Der Shop blendet den Streichpreis nach `aktion.ende` selbst aus
   (`snippets/tp-aktion-aktiv.liquid`, `tp-rabatt-sichtbar.liquid`). Am Tag danach
   frischen Export ziehen und
   `npm run -s angebot -- ende export.jsonl <ordner> --stichtag <ende+1>` →
   `rueckstellen.jsonl` schreiben. Das gilt auch fuer den Dauerrabatt
   (`--klasse preisanker`).

## Regeln im Skript

- Basis ist der aktuelle Verkaufspreis; schon reduzierte Varianten, Muster (`M-`) und
  Nullpreise bleiben aussen vor.
- **30-Tage-Sperre:** Ein Produkt, dessen letzte Aktion vor weniger als 30 Tagen endete,
  kommt nicht in die Welle (PAngV § 11 - der Streichpreis muss der niedrigste Preis der
  letzten 30 Tage sein). Gruende stehen in `ausgelassen.csv`.
- Wellen setzen `aktion.klasse = aktion`: befristete Aktion, **nicht** mit dem
  kostenlosen Vor-Ort-Service kombinierbar (Inhaber 2026-09-20). Der Dauerrabatt
  `preisanker` bleibt kombinierbar und endet ebenfalls mit `aktion.ende`.
- Produkttexte duerfen keinen abweichenden Rabatt versprechen.

## Stand

- Dauerrabatt vom 24.09. (482 Produkte, `preisanker`): `aktion.ende = 2026-11-01`,
  Rueckstellung am 02.11.2026.
- Welle 1 Teppichboden: Rueckstellung 19.10. (#413).
