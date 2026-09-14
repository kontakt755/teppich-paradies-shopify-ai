# Google Merchant Center: Flaechenware und Hilfsprodukte (Empfehlung)

Stand 2026-09-14, Agent 8 (Welle 2, Golden Product Piumera). **Empfehlung, keine Umsetzung.**

## Ist-Zustand

- Der Shop hat vier Publikationen: Onlineshop, Shop, Point of Sale und **Google & YouTube**
  (Publication 367654764878).
- **Keines** der Piumera-Produkte und keines der Hilfsprodukte ist auf „Google & YouTube"
  publiziert (Admin API `resourcePublications`, 2026-09-14). Der Shopify-Google-Kanal
  nimmt nur dort publizierte Produkte in den Feed. **Heute liegt also kein Produkt im Feed**,
  das Risiko ist latent - es wird akut, sobald jemand ein Produkt auf Google publiziert.
- Ob ein Dritt-Feed (Merchant-Center-Direktupload, Feed-App) laeuft, ist aus den Daten
  nicht ersichtlich. Vor jeder Publikation pruefen.
- Merchant Center gleicht Feedpreise gegen das Product-JSON-LD der Seite ab
  („automatische Artikelaktualisierung"). Seit `snippets/tp-product-structured-data.liquid`
  (Welle 2) tragen Flaechenware-Seiten den **m²-Preis als UnitPriceSpecification**
  (referenceQuantity 1 MTK), Service-Produkte tragen **kein** Product-JSON-LD.

## Was NICHT in den Feed gehoert

| Produkt / Variante | Handle | Shopify-Preis | Warum nicht |
|---|---|---|---|
| Piumera Teppich nach Maß (14 Varianten) | `piumera-teppich-nach-mass` | 0,89 EUR je 0,01 m² (`custom.preis_pro_001_qm = true`) | Der Variantenpreis ist eine Rechengroesse. Im Feed stuende 0,89 EUR - Merchant Center meldet Preisabweichung, Kunde kommt mit falscher Erwartung. Konfigurationsprodukt (Mindestpreis 99 EUR, Kettelung extra) ist ohne Preis je Artikel nicht feedfaehig. |
| Kettelservice | `kettelservice` | 0,19 EUR je 0,01 lfm | Dienstleistung, UNLISTED, `requiresShipping = false`, kein Bild. Als Google-Angebot sinnlos und irrefuehrend. |
| Teppich-Fußleiste, gekettelt (6 Hoehen) | `teppich-fussleiste-gekettelt` | 10,95 EUR je lfm | Hilfsartikel ohne Farbe, ohne Bild, nur ueber den Rollenware-Rechner sinnvoll bestellbar. |
| Kostenloses Muster | `kostenloses-muster` | 0,00 EUR | Google verlangt Preis > 0. Muster sind kein Verkaufsartikel. |
| Meterware, **Breite „Wunschmaß"** (14 Varianten) | `piumera-teppichboden-400cm-500cm` | 89,00 EUR je m² (Zuschnittpreis 65,90 x 1,35) | Kein eigenstaendiges Angebot, sondern der Zuschnitt-Zuschlag im Rechner. Ohne SKU, ohne Bild. Im Feed erschiene dieselbe Farbe zweimal mit zwei Preisen. |

Dasselbe Muster gilt fuer jedes weitere Produkt mit `custom.preis_pro_001_qm = true`,
`productType = Service`/`Musterservice` oder Tag `service`.

## Was in den Feed darf - und mit welcher Preislogik

**Meterware-Varianten** (Breite 400cm / 500cm, `custom.rollenbreite > 0`): Preis je m²
(65,90 EUR). Das ist seit dem Rollenware-Kaufbereich (PR #277, 2026-09-13) ein echter
Kaufpreis: Bestellmenge = m². Im Feed als Einheitspreis ausweisen:

- `price` = 65,90 EUR
- `unit_pricing_measure` = `1 sqm` (bzw. `1 m2`), `unit_pricing_base_measure` = `1 sqm`
- Google-Kategorie `google_product_category = 2826` (wie bei der Haftunterlage gesetzt;
  Metafeld `mm-google-shopping.google_product_category`)
- Bild je Farbe (400 und 500 teilen dasselbe Bild - zulaessig)

Hinweis: Der sichtbare Seitenpreis muss zum Feedpreis passen. Die Produktseite zeigt
65,90 EUR/m² (`snippets/price.liquid`, `blocks/price_custom.liquid`), das JSON-LD ebenfalls.
Ein Mindestbestellwert (z. B. 1 lfm x Rollenbreite) ist im Feed nicht abbildbar - falls der
Rechner eine Mindestmenge erzwingt, ist das ein Punkt fuer den Inhaber.

## Wie der Variantenausschluss technisch geht

Der Shopify-Google-Kanal kennt keinen Ausschluss einzelner Varianten. Zwei Wege:

1. `mm-google-shopping.custom_label_0 = "wunschmass"` an den 14 Wunschmaß-Varianten setzen
   (Metafeld-Definition existiert bereits) und im Merchant Center eine Ausschlussregel auf
   dieses Label legen. **Vorher pruefen**, ob der Shopify-Kanal `custom_label_0` aus genau
   diesem Namespace liest (Definition stammt von einer Feed-App, nicht vom Google-Kanal).
2. Feed-App mit Variantenfilter (Option „Breite" != „Wunschmaß").

Hilfsprodukte (Maß, Kettelservice, Fußleiste, Muster) **nie** auf „Google & YouTube"
publizieren - das ist die einzige zuverlaessige Sperre; kein `publishablePublish` fuer sie.

## Offen fuer den Inhaber

- Soll die Meterware ueberhaupt bei Google gelistet werden (Versandkosten, Speditionslogik,
  Mindestmenge)?
- Google-Kategorie bestaetigen (2826 = Fußböden & Teppichböden).
- Feed-App vs. Shopify-Kanal fuer den Variantenausschluss.
