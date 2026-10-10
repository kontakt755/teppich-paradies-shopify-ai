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
   (`--klasse preisanker`). `rueckstellen.csv` zeigt je Variante Zuschnitt,
   Aktionspreis, Vergleichspreis und Zielpreis (zur Freigabe).
   Liegt der Export als zwei JSON-Arrays vor (Varianten nur mit `product.id`, Produkte
   getrennt, z. B. seitenweise per `shopify store execute`):
   `npm run -s angebot -- ende varianten.json <ordner> --produkte produkte.json --stichtag <ende+1>`.
   Laufen zwei Aktionen derselben Klasse mit verschiedenen Enddaten, mit
   `--ende-am <aktion.ende>` auf genau eine begrenzen - sonst nimmt der spaetere Stichtag
   die fruehere Aktion mit, falls sie noch nicht zurueckgestellt ist.

## Regeln im Skript

- Basis ist der aktuelle Verkaufspreis; schon reduzierte Varianten, Muster (`M-`) und
  Nullpreise bleiben aussen vor.
- **30-Tage-Sperre:** Ein Produkt, dessen letzte Aktion vor weniger als 30 Tagen endete,
  kommt nicht in die Welle (PAngV § 11 - der Streichpreis muss der niedrigste Preis der
  letzten 30 Tage sein). Gruende stehen in `ausgelassen.csv`.
- **Zielpreis der Rueckstellung:** Der Vergleichspreis wird geleert.
  - Meterware: Zielpreis = Vergleichspreis (belegter Vorpreis).
  - Raummass (Variante mit Optionswert `Wunschmaß`, bei Teppichboden Option `Breite`;
    ohne `selectedOptions` im Export zaehlt der Variantentitel `Farbe / Wunschmaß`):
    naechstgelegener ,90-Betrag zum Vergleichspreis, `round(x + 0,10) - 0,10`
    (Inhaber 2026-10-05). Volle Euro gehen 0,10 nach unten (104,00 → 103,90,
    50,00 → 49,90), Betraege auf ,90 bleiben. Das Ziel liegt nie ueber dem Vergleichspreis
    (88,50 -> 87,90); unbekannte Wunschmass-Schreibweisen meldet das Skript als
    WARNUNG. Dieselbe Regel gilt fuer die vorab
    berechnete `rueckstellen.jsonl` aus `plan`.
  - Muster (`M-`, Handle `muster-…`) werden nie zurueckgestellt.
  - **Vergleichspreis ist kein eigener Vorpreis** (z. B. UVP neuer Linien, die nie zu
    diesem Preis im Shop standen): `--ausschluss <ids.txt>` (eine Varianten-ID je Zeile,
    `#` = Kommentar). Diese Varianten werden nicht auf den Vergleichspreis hochgesetzt,
    sondern landen in `ausgeschlossen.csv` und `nur-vergleichspreis-leeren.jsonl`
    (Preis unveraendert, Vergleichspreis `null`). Ohne die Liste wuerde `ende` den Preis
    auf die UVP anheben. Die Liste selbst liegt lokal unter `~/teppich-paradies-analyse/`
    (enthaelt Shop-IDs, gehoert nicht ins Repository).
- Wellen setzen `aktion.klasse = aktion`: befristete Aktion, **nicht** mit dem
  kostenlosen Vor-Ort-Service kombinierbar (Inhaber 2026-09-20). Der Dauerrabatt
  `preisanker` bleibt kombinierbar und endet ebenfalls mit `aktion.ende`.
- Produkttexte duerfen keinen abweichenden Rabatt versprechen.

## Stand

- Dauerrabatt vom 24.09. (`preisanker`): `aktion.ende = 2026-11-01`, Rueckstellung am
  02.11.2026 mit `--stichtag 2026-11-02 --klasse preisanker --ende-am 2026-11-01`.
  Probelauf gegen den Export vom 08.10.: 2.182 Varianten in 503 Produkten (77 Raummass
  in 12 Produkten); ohne `--ende-am` kaemen die 680 Welle-1-Varianten dazu.
- Welle 1 Teppichboden: Rueckstellung 19.10. (#413). Probelauf am 08.10. gegen den
  Export vom 08.10. (`--stichtag 2026-10-19 --klasse preisanker`): 680 Varianten in
  18 Produkten (451 Meterware, 229 Raummass), Zielpreise identisch mit der
  freigegebenen Variantenliste.
- UVP-Vergleichspreise neuer Linien (74 Varianten in 40 Produkten, alle `preisanker`,
  Ende 01.11.): am 09.10. geleert, am 10.10. Wiederherstellung gewuenscht (Freigabe der
  konkreten Tabelle offen). Sind sie wiederhergestellt, braucht die Rueckstellung am 02.11.
  `--ausschluss`, sonst setzt `ende` diese Preise um 5–18 % auf die UVP hoch. Welle 1
  (Stichtag 19.10.) erfasst sie nicht, weil ihr `aktion.ende` nach dem Stichtag liegt.
