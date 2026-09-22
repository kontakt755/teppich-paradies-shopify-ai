# Merchant Center: Feedtitel und Pre-Launch-Prüfung (Vorlage, M9)

Stand 2026-09-22. Ziel (Auftrag §§ 24–25): Feedtitel mit Produktart, Struktur,
Farbe und Breite, ohne Lieferantennamen; Feed, Landingpage, Bild, Preis und
Verfügbarkeit konsistent.

## Entscheidung: Titel per Feedregel, nicht per Produkt-Umbenennung
Die Shopify-Titel („Piumera Teppichboden 400cm 500cm") bleiben, bis der
Hausmarken-Name entschieden ist (`docs/MARKENSTRATEGIE.md`, Abschnitt Offen).
Eine Umbenennung von 250 Produkten wäre SEO-relevant (Title-Tags aus
`snippets/meta-tags.liquid`) und käme vor der Markenentscheidung.

## Feedregel (Merchant Center → Produkte → Feeds → Shopify-Feed → Feedregeln → title)
Regel „Wert festlegen" aus Attributen, mit Fallback auf den Shopify-Titel:

```
title = product_type-Zusatz + Linie + Struktur + Farbe + Breite
```

Praktisch über Shopify-Daten, die der Google-&-YouTube-Kanal überträgt:
- `title` (Shopify) – enthält Linie und Produktart
- `color` – kommt aus der Variantenoption „Farbe" (Kanal-Mapping prüfen: Google & YouTube App → Produktdaten → Farbe = Option „Farbe")
- `custom_label_0` – frei: Struktur (Velours/Schlinge/Hochflor) aus `custom.belagsart`/`custom.florhohe` kann der Kanal nicht direkt füllen → Google-App-Bulk-Edit oder Zusatzfeed (CSV `id, custom_label_0`) aus dem Admin-Export.

Regel im Merchant Center (Beispiel): `title` = `[title] – [custom_label_0] – [color]`
Ergebnis: „Piumera Teppichboden 400cm 500cm – Velours Hochflor – Sand Hell".

## Zusatzfeed „Struktur" erzeugen (lokal, aus der Admin-API)
Felder je Variante: `id` (Shopify-Variant-ID wie im Kanal: `shopify_DE_<productId>_<variantId>`),
`custom_label_0` = Struktur aus `custom.belagsart` + Florhöhen-Klasse `custom.florhohe`,
`custom_label_1` = Produktgruppe (Teppichboden / Klickvinyl / Klebevinyl / Vinyl Rolle / Fliese / Planke).
Vorlage: `graphql products { id productType variants { id } metafield(belagsart) metafield(florhohe) }` → CSV → Merchant Center „Zusatzfeed" → Feedregel verknüpft über `id`.

## Pre-Launch-Prüfliste (Admin, Google & YouTube App + Merchant Center)
| Prüfung | Quelle | Status 11.09. |
|---|---|---|
| Alle Produkte genehmigt | Merchant Center → Produkte → Diagnose | 0 approved, 225 awaiting_review |
| Ablehnungen/Warnungen | Diagnose | 0 rejected |
| 404 auf Landingpages | Diagnose „Landingpage nicht erreichbar" | – |
| Preisabweichung | Diagnose „Preisabweichung" | Feedpreis = Paketpreis, Einheitspreis m² (236 Varianten) |
| Verfügbarkeit | Diagnose | – |
| GTIN | keine eigenen → `identifier_exists = no` oder eigenes MPN-Schema (`docs/MARKENSTRATEGIE.md`) | 225 ohne GTIN |
| Marke | `brand` = Vendor (Produktlinie / TeppichParadies) – nach Markenentscheidung vereinheitlichen | uneinheitlich |
| Versanddaten | Merchant Center Versandeinstellungen + Versandrichtlinie `/policies/shipping-policy` | **404, Pflicht** (`domains/shopify/versandrichtlinie-vorlage.md`) |
| Rückgabe | Widerrufsrecht-Policy vorhanden | ok |
| Strukturierte Daten | `snippets/tp-product-structured-data.liquid` (Offer mit UnitPriceSpecification, ohne gtin/shipping) | ok für Paketware |
| Doppelte SKUs (8) / fehlende SKUs (41 Klebevinyl) | Admin-Export | Freigabe nötig (SKU-Änderung = Sicherheitsgrenze) |
