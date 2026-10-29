# Produkt-JSON-LD: Rückgabe- und Versandangaben

Werkbank w-117, Variante A (Inhaber 16.10.2026). Befund M2 aus
`docs/audits/theme-audit-2026-10-16.md`: Die Offers im Produkt-JSON-LD trugen
weder `hasMerchantReturnPolicy` noch `shippingDetails`.

**Diese Tabelle ist die Freigabegrundlage.** Umgesetzt in
`snippets/tp-product-structured-data.liquid`, geprüft in
`qa/tests/produkt-jsonld-rueckgabe-versand.test.mjs`. Rechtstexte und
Versandeinstellungen wurden nur gelesen, nicht geändert.

## Quellen (gelesen am 16.10.2026)

| Quelle | Weg | Inhalt, der ins Markup geht |
|---|---|---|
| Widerrufsbelehrung (`REFUND_POLICY`, Stand 15.10.2026) | Admin API `shop.shopPolicies` | 14 Tage ab Besitz der Ware; Rücksendung „zurückzusenden oder zu übergeben“; Kunde trägt die unmittelbaren Rücksendekosten (Spedition geschätzt bis ca. 120 € je Ware); Ausschluss für Ware, die nach Kundenwunsch zugeschnitten oder angefertigt wird: Teppichboden von der Rolle auf Wunschmaß, PVC-/Vinyl-Rollenware mit Zuschnitt, Läufer mit Wunschlänge/-breite, individuell gekettelte Teppiche/Läufer, Sonderanfertigungen und Sondermaße; Standardartikel behalten das Widerrufsrecht |
| AGB Ziffer 4 und 10 (`TERMS_OF_SERVICE`) | Admin API | bestätigt: Zuschnitt-Rollenware kann ausgeschlossen sein, maßgeblich ist die Widerrufsbelehrung |
| Versandrichtlinie (`SHIPPING_POLICY`) | Admin API | Deutschland 4,99 € je Bestellung, ab 50 € versandkostenfrei; Muster kostenlos; EU 13,99 €, weitere Länder 19,99 €; Lieferzeit steht je Produktseite |
| Versandprofile | Admin API `deliveryProfiles` | „Allgemeines Profil“ (Standard, alle Kaufprodukte), Zone Deutschland: 4,99 € ab 0 €, 0 € ab 50 € Bestellwert (`TOTAL_PRICE`). EU-Zone 13,99 €, International 19,99 €. „Kostenlose Muster“: 0 € (nur Musterprodukte). „Bodenbeläge & Teppiche – kostenlos“: 0 Varianten |
| Theme-Einstellungen „TP Versand“ | `config/settings_schema.json` | `tp_versand_preis` „4,99 €“, `tp_versand_frei_ab` 50 (passen zum Profil, `qa/tests/versandschwelle.test.mjs`), `tp_lieferzeit_sonderposten` „5–7 Werktage“ |
| Lieferzeit auf der Produktseite | `snippets/tp-lieferzeit.liquid`, Block-Einstellungen in `templates/product*.json` | Reihenfolge: Metafeld `service.lieferzeit` → Sonderposten-Einstellung → Wert der Produktvorlage |
| Mindestmengen | `blocks/tp-rollware-rechner.liquid`, `blocks/tp-einfass-konfigurator.liquid` | Rollenware mindestens 1 m Länge (oder `custom.mindestlaenge_lfm`); Maß-Ware mindestens `service.min_seite_cm` (Standard 50 cm) je Seite und `service.mindestpreis` (Teppich nach Maß derzeit 99 €) |
| Google-Doku Merchant Listings | developers.google.com, Abschnitte MerchantReturnPolicy / OfferShippingDetails | Pflicht: `applicableCountry`, `returnPolicyCategory`, bei Frist `merchantReturnDays`; `ReturnFeesCustomerResponsibility` ohne Betrag; Versand: `shippingRate`, `shippingDestination.addressCountry`, `deliveryTime` |

## Tabelle: Produktart → Rückgabe → Versand

Versand gilt nur für Deutschland (`addressCountry` DE) und nur, wenn der
Shop in EUR ausgibt. „Versandkosten“ ist der Wert für die **kleinste
bestellbare Menge** des jeweiligen Angebots: Liegt sie schon bei 50 € oder
darüber, steht 0, sonst 4,99. So steht nie Gratisversand im Markup, den der
Checkout nicht gibt.

| Produktart (Erkennung im Snippet) | Rückgabe im Markup | Ausnahme laut Widerrufsbelehrung | Versandkosten DE im Markup | Lieferzeit im Markup | Quelle |
|---|---|---|---|---|---|
| Teppich nach Maß, gekettelt (Vorlage `einfassung`, `custom.preis_pro_001_qm`) | `MerchantReturnNotPermitted` | „individuell gekettelte Teppiche“, Sondermaße | 0 € (Mindestpreis 99 € ≥ 50 €); ohne Mindestpreis: 50 × 50 cm × m²-Preis | 5–8 Werktage (Metafeld „ca. 5–8 Werktage inkl. Ketteln“) | Widerruf, Profil, Konfigurator, Metafeld |
| Design-Teppich nach Maß (Vorlage `wunschmass-fertig`, `preis_pro_001_qm`) | `MerchantReturnNotPermitted` | Sonderanfertigung nach Kundenmaß | **kein `shippingDetails`** | – („ca. 14 Tage“ sind Kalendertage, keine Werktage) | Widerruf, Vorlage |
| Kokosmatte nach Maß (Vorlage `matte-nach-mass`, `preis_pro_001_qm`) | `MerchantReturnNotPermitted` | Sondermaß nach Kundenwunsch | **kein `shippingDetails`** | – („ca. 14 Tage“) | Widerruf, Vorlage |
| Längenware nach Maß (`custom.preis_pro_001_lfm`; derzeit kein aktives Produkt gefunden) | `MerchantReturnNotPermitted` | Sondermaß nach Kundenwunsch | 4,99 € (kleinste Einheit 0,01 lfm, keine Mindestlänge belegt) | je Vorlage, `treppenkante-nach-mass`: 2–5 Werktage | Widerruf, Vorlage |
| Rollenware: Teppichboden, Vinyl von der Rolle, Linoleum, Kunstrasen, Kokos-Sauberlauf von der Rolle (Vorlage `rolle`, Variante mit `custom.rollenbreite`) | `MerchantReturnNotPermitted` | Zuschnitt von der Rolle auf Kundenmaß (Teppichboden und PVC/Vinyl ausdrücklich genannt) | Rollenbreite × 1 m (bzw. Mindestlänge) × m²-Preis ≥ 50 € → 0 €, sonst 4,99 € (z. B. Vinyl 2 m × 19,50 € = 39 € → 4,99 €) | 2–5 Werktage (Vorlage `rolle`), Direktversand-Ware laut Metafeld z. B. 5–7 | Widerruf, Profil, Rechner, Vorlage |
| Paketware: Klick-/Klebevinyl, Fliesen (`custom.qm_pro_paket`, Vorlagen `planken`, `fliese`) | 14 Tage, `ReturnByMail`, `ReturnFeesCustomerResponsibility` | keine (Standardware in ganzen Paketen) | Paketpreis ≥ 50 € → 0 €, sonst 4,99 € | 2–5 Werktage | Widerruf, Profil, Vorlage |
| Festpreisware: Sockelleisten (`fixpreis`), Zubehör, Profile, Sauberlaufmatten (`zubehoer`) | 14 Tage, per Post, Kunde zahlt Rücksendung | keine | Stückpreis ≥ 50 € → 0 €, sonst 4,99 € | 2–5 Werktage | Widerruf, Profil, Vorlage |
| Teppiche/Wohnteppiche in festen Größen (`dekofell`), Standardvorlage `product` | 14 Tage, per Post, Kunde zahlt Rücksendung | keine | Stückpreis ≥ 50 € → 0 €, sonst 4,99 € | 5–7 Werktage | Widerruf, Profil, Vorlage |
| Teppiche (Vorlage `teppich`) | 14 Tage, per Post, Kunde zahlt Rücksendung | keine | Stückpreis ≥ 50 € → 0 €, sonst 4,99 € | 3–5 Werktage | Widerruf, Profil, Vorlage |
| Vorlage `wohnteppich` | 14 Tage, per Post, Kunde zahlt Rücksendung | keine | **kein `shippingDetails`** (Vorlage zeigt keine Lieferzeit) | – | Widerruf, Vorlage |
| Sonderposten (Tag `sonderposten`) | 14 Tage (Neuware und B-Ware gleich) | keine | Stückpreis-Regel; kein `shippingDetails` bei „Nur Abholung“ oder ungesichertem Bestand | 5–7 Werktage (Theme-Einstellung) | Widerruf, Profil, `tp-sonderposten-kaufstatus` |
| Raummaß-/Wunschmaß-Varianten am Teppichboden | – (kein eigenes Angebot, wie bisher) | – | – | – | bestehende Regel |
| Muster (`Musterservice`), Kettelservice/Fußleiste (`Service`, Tag `service`) | – (kein JSON-LD, wie bisher) | – | – | – | bestehende Regel |
| Geschenkgutschein (`gift_card?`) | **keine Angabe** | im Rechtstext nicht geregelt | keine Angabe (kein Versand) | – | – |

Muster-Varianten in Kaufprodukten gibt es nicht (Suche nach Varianten
„Muster“ bei aktiven Produkten: 0 Treffer); Muster sind eigene Produkte vom
Typ `Musterservice` und bleiben ohne JSON-LD.

## Regeln im Snippet

- **Rückgabe ausgeschlossen**, wenn eines der vorhandenen Preis-Merkmale
  greift: `preis_pro_001_qm` (Maß-Ware), `preis_pro_001_lfm` (Länge nach
  Maß) oder Rollenware (Rollenbreite an einer Variante, nicht Paketware).
  Das sind dieselben Merkmale, mit denen das Snippet schon den m²-Preis
  bestimmt (Kopfkommentar). Alles andere: 14 Tage.
- **Lieferzeit** wie `snippets/tp-lieferzeit.liquid`. Die Vorlagenwerte sind
  Block-Einstellungen, die das JSON-LD nicht lesen kann; das Snippet führt
  sie je `template_suffix` nach. Der Test vergleicht jede
  `templates/product*.json` mit dem Markup und schlägt fehl, sobald eine
  Vorlage eine andere Lieferzeit zeigt.
- Nur eine Werktage-Spanne wird ausgezeichnet; die Gesamtangabe steht als
  `transitTime` (Einheit `DAY`). `handlingTime` erscheint erst, wenn die
  Theme-Einstellung „Bearbeitungszeit bis zum Versand“
  (`tp_versand_bearbeitungszeit`, Bereich TP Versand) eine Werktage-Spanne
  trägt: dann Bearbeitung = dieser Wert, Transport = Lieferzeit minus
  Bearbeitung je Grenze (z. B. Lieferzeit 2–5, Bearbeitung 1–2 → Transport
  1–3). Ist die Bearbeitung länger als die Lieferzeit eines Produkts, bleibt
  es dort bei der Gesamtzeit.
- **Fail closed:** kein `shippingDetails` bei anderer Währung als EUR,
  unlesbaren Versandkosten, Varianten ohne Versand, gesperrten Sonderposten
  und Produkten ohne Werktage-Lieferzeit. Die Rückgabeangabe bleibt dann
  trotzdem stehen.

## Beispiele je Produktart

Erzeugt aus dem Snippet mit LiquidJS (dieselbe Umgebung wie die Tests),
jedes Beispiel mit `JSON.parse` geprüft. Gezeigt ist nur das Offer eines
Angebots: `price` plus die neuen Felder.

**Teppich nach Maß (Vorlage einfassung, Mindestpreis 99 €, Metafeld-Lieferzeit)**

```json
{"price":89,"hasMerchantReturnPolicy":{"@type":"MerchantReturnPolicy","applicableCountry":"DE","returnPolicyCategory":"https://schema.org/MerchantReturnNotPermitted"},"shippingDetails":{"@type":"OfferShippingDetails","shippingRate":{"@type":"MonetaryAmount","value":0,"currency":"EUR"},"shippingDestination":{"@type":"DefinedRegion","addressCountry":"DE"},"deliveryTime":{"@type":"ShippingDeliveryTime","transitTime":{"@type":"QuantitativeValue","minValue":5,"maxValue":8,"unitCode":"DAY"}}}}
```

**Design-Teppich nach Maß (Vorlage wunschmass-fertig)**

```json
{"price":119,"hasMerchantReturnPolicy":{"@type":"MerchantReturnPolicy","applicableCountry":"DE","returnPolicyCategory":"https://schema.org/MerchantReturnNotPermitted"}}
```

**Teppichboden von der Rolle, 4 m breit, 29,95 €/m² (Vorlage rolle)**

```json
{"price":29.95,"hasMerchantReturnPolicy":{"@type":"MerchantReturnPolicy","applicableCountry":"DE","returnPolicyCategory":"https://schema.org/MerchantReturnNotPermitted"},"shippingDetails":{"@type":"OfferShippingDetails","shippingRate":{"@type":"MonetaryAmount","value":0,"currency":"EUR"},"shippingDestination":{"@type":"DefinedRegion","addressCountry":"DE"},"deliveryTime":{"@type":"ShippingDeliveryTime","transitTime":{"@type":"QuantitativeValue","minValue":2,"maxValue":5,"unitCode":"DAY"}}}}
```

**Vinyl von der Rolle, 2 m breit, 19,50 €/m² (Vorlage rolle)**

```json
{"price":19.5,"hasMerchantReturnPolicy":{"@type":"MerchantReturnPolicy","applicableCountry":"DE","returnPolicyCategory":"https://schema.org/MerchantReturnNotPermitted"},"shippingDetails":{"@type":"OfferShippingDetails","shippingRate":{"@type":"MonetaryAmount","value":4.99,"currency":"EUR"},"shippingDestination":{"@type":"DefinedRegion","addressCountry":"DE"},"deliveryTime":{"@type":"ShippingDeliveryTime","transitTime":{"@type":"QuantitativeValue","minValue":2,"maxValue":5,"unitCode":"DAY"}}}}
```

**Paketware (Vorlage planken, Paket 71,80 € = 41,50 €/m²)**

```json
{"price":41.5,"hasMerchantReturnPolicy":{"@type":"MerchantReturnPolicy","applicableCountry":"DE","returnPolicyCategory":"https://schema.org/MerchantReturnFiniteReturnWindow","merchantReturnDays":14,"returnMethod":"https://schema.org/ReturnByMail","returnFees":"https://schema.org/ReturnFeesCustomerResponsibility"},"shippingDetails":{"@type":"OfferShippingDetails","shippingRate":{"@type":"MonetaryAmount","value":0,"currency":"EUR"},"shippingDestination":{"@type":"DefinedRegion","addressCountry":"DE"},"deliveryTime":{"@type":"ShippingDeliveryTime","transitTime":{"@type":"QuantitativeValue","minValue":2,"maxValue":5,"unitCode":"DAY"}}}}
```

**Festpreisware unter 50 € (Vorlage fixpreis, 8,50 €)**

```json
{"price":8.5,"hasMerchantReturnPolicy":{"@type":"MerchantReturnPolicy","applicableCountry":"DE","returnPolicyCategory":"https://schema.org/MerchantReturnFiniteReturnWindow","merchantReturnDays":14,"returnMethod":"https://schema.org/ReturnByMail","returnFees":"https://schema.org/ReturnFeesCustomerResponsibility"},"shippingDetails":{"@type":"OfferShippingDetails","shippingRate":{"@type":"MonetaryAmount","value":4.99,"currency":"EUR"},"shippingDestination":{"@type":"DefinedRegion","addressCountry":"DE"},"deliveryTime":{"@type":"ShippingDeliveryTime","transitTime":{"@type":"QuantitativeValue","minValue":2,"maxValue":5,"unitCode":"DAY"}}}}
```

**Wohnteppich in fester Größe (Vorlage dekofell, 129 €)**

```json
{"price":129,"hasMerchantReturnPolicy":{"@type":"MerchantReturnPolicy","applicableCountry":"DE","returnPolicyCategory":"https://schema.org/MerchantReturnFiniteReturnWindow","merchantReturnDays":14,"returnMethod":"https://schema.org/ReturnByMail","returnFees":"https://schema.org/ReturnFeesCustomerResponsibility"},"shippingDetails":{"@type":"OfferShippingDetails","shippingRate":{"@type":"MonetaryAmount","value":0,"currency":"EUR"},"shippingDestination":{"@type":"DefinedRegion","addressCountry":"DE"},"deliveryTime":{"@type":"ShippingDeliveryTime","transitTime":{"@type":"QuantitativeValue","minValue":5,"maxValue":7,"unitCode":"DAY"}}}}
```

## Offene Punkte für den Inhaber (nicht geraten, nur benannt)

1. **Rücksendung im Laden:** Die Belehrung erlaubt „zurückzusenden oder zu
   übergeben“. Das Markup nennt nur `ReturnByMail`. Wenn Rückgaben im Laden
   Oranienburg angenommen werden, käme `ReturnInStore` dazu.
2. **Kunstrasen und Kokos-Sauberlauf von der Rolle** stehen nicht wörtlich
   in der Ausschlussliste (dort: Teppichboden, PVC/Vinyl). Sie sind hier
   über die allgemeine Regel (Zuschnitt nach Kundenmaß) und „Sondermaße nach
   Kundenwunsch“ als ausgeschlossen eingeordnet. Bitte bestätigen; sonst
   gehört die Belehrung ergänzt (das macht der Inhaber, nicht das Theme).
3. **Nur Deutschland:** Der Shop versendet laut Profil auch in die EU
   (13,99 €) und weitere Länder (19,99 €). Für diese Zonen gibt es keine
   Lieferzeit im Shop, deshalb keine Auszeichnung. Rückgabe ebenfalls nur mit
   `applicableCountry` DE.
4. **Bearbeitungs- und Transportzeit:** Die Werktage-Angabe ist die
   Gesamtzeit bis zur Lieferung. Sie steht als `transitTime`; eine
   Aufteilung in `handlingTime` und `transitTime` ist nicht belegt.
   Search Console meldet deshalb „Feld handlingTime fehlt“ (27.10.: 123
   Händlereinträge, nur ein Hinweis, kein Fehler). Seit der Einstellung
   „Bearbeitungszeit bis zum Versand“ genügt ein Eintrag im Theme-Editor
   (z. B. „1–2 Werktage“), sobald der Inhaber die Zeit bis zum Versand
   bestätigt; das Merchant Center führt ebenfalls nur die Gesamtzeit
   („5–7 Werktage“, manuell).
5. **„ca. 14 Tage“** (Design-Teppich nach Maß, Kokosmatte nach Maß) sind
   Kalendertage. Ohne Werktage-Angabe gibt es dort kein `shippingDetails`.
   Wird die Angabe in Werktagen gepflegt, greift das Markup automatisch.
6. **Merchant Center:** Google bevorzugt Rückgabe- und Versandeinstellungen
   aus dem Merchant Center. Sind dort andere Werte hinterlegt, widerspricht
   das Markup ihnen – bitte dort gegenprüfen.
7. **Geschenkgutschein:** Rückgabe/Widerruf ist im Rechtstext nicht
   geregelt, deshalb keine Angabe.
8. **Rechtstext ändert sich:** Frist (14 Tage), Rücksendeweg und
   Kostenregel stehen als feste Werte im Snippet. Bei einer neuen
   Widerrufsbelehrung gehören Snippet, Test und diese Tabelle zusammen
   geändert.
9. **Zuordnung der Muster-Varianten zum Versandprofil** wurde stichprobenhaft
   geprüft (die ersten 50 Einträge des Profils „Kostenlose Muster“ sind alle
   `Musterservice`), nicht vollständig.
