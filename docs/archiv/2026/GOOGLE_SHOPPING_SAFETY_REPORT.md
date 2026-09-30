# Google Shopping Safety Report

Stand: 12. August 2026  
Live-Theme: `theme-productpage-v2-night (2026-08-10)`, ID `201829679438`  
Fallback: `Horizon`, ID `196301750606` (unverändert)

## 1. Ursache und Structured-Data-Quellen

Horizon erzeugte Product-/Offer-Structured-Data an drei Stellen mit Shopifys ungefiltertem `structured_data`-Filter:

- `sections/product-information.liquid`
- `sections/featured-product.liquid`
- `sections/featured-product-information.liquid`

Auf einer normalen Produktdetailseite waren öffentlich zwei JSON-LD-Blöcke vorhanden: Organization aus `sections/header.liquid` und Product beziehungsweise ProductGroup aus der Product-Section. Repräsentative Live-Seiten zeigten keinen zusätzlichen Product-JSON-LD-Block einer App. Der ungefilterte Shopify-Block gab bei Rollenware echte Grundpreisvarianten und vorhandene `opc-*`-Varianten als Offers aus.

## 2. Implementierte Schutzlogik

Das neue gemeinsame Snippet `snippets/tp-product-structured-data.liquid` verwendet ausschließlich strukturierte Variantendaten:

- Rollenware: Mindestens eine echte Nicht-OPC-Variante hat `custom.rollenbreite > 0`.
- OPC: Variantentitel enthält entsprechend der vorhandenen Theme-Logik `opc-*`.
- Titel, Tags, Beschreibung und Produkttyp werden nicht zur Rollenware-Erkennung verwendet.

Für normale und Paketprodukte bleibt Shopifys ursprüngliche `structured_data`-Ausgabe unverändert. Für sicher erkannte Rollenware und für Produkte mit einer technischen OPC-Variante wird der Product-Merchant-Block vollständig ausgelassen. Organization-Markup bleibt bestehen. Es werden weder Mindestpreis noch Fläche oder dynamischer OPC-Preis erfunden.

Diese konservative Lösung erfüllt zugleich den globalen OPC-Schutz: Eine technische OPC-Variante kann nicht als Offer erscheinen, auch wenn ein Produkt künftig wider Erwarten nicht als Rollenware erkannt würde.

## 3. Daten-Audit und Ausschlussliste

Read-only geprüft wurden 344 aktive Produkte. Sicher erkannt wurden 118 Rollenware-Produkte:

- 2 + 3 + 4 m: 3
- 2 + 4 m: 58
- 3 m: 2
- 4 m: 7
- 4 + 5 m: 47
- 5 m: 1

Davon besitzen aktuell drei Produkte zusammen neun dauerhafte `opc-*`-Varianten:

- `softiq-teppichboden`: 1
- `seleno-teppichboden`: 2
- `tavora-teppichboden`: 6

Es wurden keine Produkt-, Varianten-, Preis-, Rollenbreiten- oder OPC-Daten geändert. Die 118 sicheren Fälle stehen in `GOOGLE_ROLLENWARE_EXCLUSION_LIST.csv`; die kanalbezogene, manuelle Bulk-Vorgehensweise steht in `GOOGLE_ROLLENWARE_EXCLUSION_PLAN.md`.

## 4. Structured-Data-Tests

Development-Preview und anschließend öffentliches Live-Theme wurden ohne Preview-Parameter geprüft.

### Paketware

Bei allen drei Produkten blieb genau ein Product-Block mit tatsächlich kaufbarem Shopify-Paketpreis, EUR, Verfügbarkeit, SKU und Brand erhalten:

- `/products/marlow-eiche-nordisch-klickvinyl-7mm` — Schema 105,98 EUR, identisch zum Varianten-/Paketpreis
- `/products/rovelia-eiche-hell-klickvinyl-10mm` — Schema 165,01 EUR, identisch zum Varianten-/Paketpreis
- `/products/bergen-eiche-hell-klickvinyl-6mm` — Schema 84,68 EUR, identisch zum Varianten-/Paketpreis

### Rollenware

Bei allen geprüften Rollenware-Fällen blieb nur das Organization-Markup. Product/ProductGroup, Offers, `price`, `lowPrice`, `highPrice` und `opc-*` wurden nicht ausgegeben:

- eine Breite: `/products/corvano-teppichboden` (4 m)
- zwei Breiten: `/products/rohan-teppichboden-400cm` (4 + 5 m)
- 2 + 4 m: `/products/traxano-eiche-honigbraun-vinylboden-von-der-rolle`
- 4 + 5 m: `/products/saphir-teppichboden-400cm-und-500cm`
- OPC-Sonderfall: `/products/softiq-teppichboden`

## 5. Kaufweg-Regressionsprüfung

Mobile (390 px) und Desktop (1440 px) wurden in der Development-Preview geprüft:

- Rollenbreitenauswahl blieb aktiv.
- Längeneingabe blieb aktiv.
- Dynamische Berechnung blieb korrekt, unter anderem 200 cm × 4 m × 32,90 EUR = 263,20 EUR sowie 200 cm × 5 m × 39,95 EUR = 399,50 EUR.
- Paketware zeigte weiterhin EUR/m² und den unveränderten Paketkaufweg.
- Ein Paketartikel wurde testweise für 105,98 EUR in einen isolierten Warenkorb gelegt.
- Eine bereits vorhandene OPC-Variante wurde testweise für 1.299,00 EUR in einen isolierten Warenkorb gelegt.
- Checkout war in beiden Fällen erreichbar; keine Bestellung wurde abgeschlossen.

Bekannter, nicht durch diese Änderung verursachter Daten-/Template-Sonderfall: `softiq-teppichboden` zeigt bereits vor diesem Auftrag die Paket-Auswahl statt der Längeneingabe. Der bestehende Warenkorb-/Checkout-Preis seiner bereits vorhandenen OPC-Variante ist technisch erreichbar. Dieser eng begrenzte Auftrag hat den Kaufweg nicht verändert und behebt den vorgelagerten Softiq-Template-Befund ausdrücklich nicht.

## 6. QA und Veröffentlichung

- `npm.cmd run qa`: Exit-Code 0
- Status: WARN
- Neue relevante Fehler: 0
- Neue Theme-Check-Findings: 0
- Hinweise: 24 bekannte Baseline-/Drittanbieterhinweise, einschließlich `header-menu / overflowMenu`
- Veröffentlicht: Ja, ausschließlich vier Theme-Dateien auf Theme `201829679438`
- Fallback `196301750606`: nicht verändert
- Shopify-Produkte/Admin-Ressourcen: nicht verändert
- Merchant Center/Google/Ads: nicht verändert

## 7. Geänderte und erstellte Dateien

Theme:

- `snippets/tp-product-structured-data.liquid`
- `sections/product-information.liquid`
- `sections/featured-product.liquid`
- `sections/featured-product-information.liquid`

Dokumentation:

- `GOOGLE_ROLLENWARE_EXCLUSION_PLAN.md`
- `GOOGLE_ROLLENWARE_EXCLUSION_LIST.csv`
- `GOOGLE_SHOPPING_SAFETY_REPORT.md`

Sicherungen der drei vorher vorhandenen Sections liegen unter `backup/google-shopping-safety/sections/` als `.bak`-Dateien.

## Kurzfassung

Paketware Schema weiterhin korrekt: JA  
Rollenware falscher Offer-Preis entfernt: JA  
opc-* aus Offers entfernt: JA  
Rollenware Kaufweg unverändert: JA  
Paketware Kaufweg unverändert: JA  
Anzahl Produkte auf Google-Ausschlussliste: 118  
QA Exit-Code: 0  
Theme veröffentlicht: JA  
Theme-ID: 201829679438  
Fallback unverändert: JA
