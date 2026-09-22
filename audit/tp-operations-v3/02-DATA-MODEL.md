# 02 – Datenmodell

## 1. Ist: Metafelder mit Beschaffungsbezug (live, 2026-09-22)

| Feld | Ebene | Typ | Inhalt / Zustand |
|---|---|---|---|
| `grosshandel.sku` („Grosshaendler-ID") | Produkt | Text | Freitext, z. B. `CVALL4_210 (400cm) / CVALL2_210 (200cm) – CV-Boden … (Fb.210)`; mischt mehrere SKUs, Linie, Qualitaet und Farbe in einem String. 405/406 aktive Produkte. Nur manuell gepflegt, Theme liest es nie. |
| `grosshandel.externe_id` | Produkt | Text | Match-Key des Sync-Skripts; im Shop praktisch nicht gesetzt. Sync und Shop reden aneinander vorbei. |
| `lieferant.hersteller`, `lieferant_a_produktname`, `lieferant_b_produktname`, `match_status`, `abgleich_datum` | Produkt | Text/Date | 52 Produkte (Teppichboden-Abgleich 2026-09-12). Bei Rollenware-Vinyl: **leer**. |
| `lieferant.lieferant_a_artikelnummer` / `_farbnummer` / `_verfuegbar`, `lieferant_b_*`, `bevorzugt`, `alternativ`, `wunschmass`, `kettelung` | Variante | Text/Bool | 943 Varianten. Bei Fliesen ist `lieferant_a_artikelnummer` = eigene SKU (kein Mehrwert). Bei Vinyl-Rollenware leer. |
| `custom.farbcode` | Variante | Text | Farbnummer des Lieferanten (z. B. `A80`), lueckenhaft. |
| `custom.farbe` → Metaobjekt `tp_farbe` | Variante | Ref | Farbregister (729 Eintraege): `bezeichnung`, `farbname`, `farbnummer`, `lieferant` (Freitext), `swatch`, `bild`. |
| `custom.qm_pro_paket`, `stueck_pro_paket`, `format_cm`, `stueck_bezeichnung` | Produkt | Zahl/Text | Paketware. |
| `custom.rollenbreite` | Produkt + Variante | Zahl | Rollenware. |
| `custom.stangenlaenge` | Produkt | Zahl | Leisten (je Produkt belegt: 2,5 / 2,4 / 4,0 / 5,15 m – **keine pauschale 2,5-m-Regel**). |
| `custom.preis_pro_001_qm` | Produkt | Bool | Preis je 0,01 m². |
| `service.*` (einfassen, raummass, einfassung, max_*, mindestpreis …) | Variante/Produkt | – | Masskonfigurator, fail closed. |
| `einkauf.*`, `service.kettelservice`, Metaobjekt `tp_lieferant` | – | – | **geplant, nicht angelegt** (`domains/lieferanten/services/README.md:29-40`). |

Order- und Customer-Metafeld-Definitionen: **keine**. Webhooks: keine.

SKU-Konvention: `LIEFERANTENKUERZEL_FARBNUMMER` (z. B. `CVEXPGR04_333`); die SKU **ist** die Lieferant-A-Artikelnummer, nicht die Herstellerfarbnummer. Muster `M-<Quell-SKU>`. Eigene Serviceartikel Lieferant A: `TEPKETT_001/002`.

## 2. Soll: `procurement_item` als Varianten-Metafelder, Namespace `einkauf` (Storefront-Zugriff NONE)

Grundsatz Masterprompt §19–22: Namen sind Marketing, IDs sind Technik. Die Beschaffungs-ID darf sich nie aendern, wenn ein Kundenname geaendert wird.

| Feld Masterprompt | Umsetzung | Herkunft |
|---|---|---|
| `procurement_id` | `einkauf.procurement_id` (Text, unveraenderlich, Format `TP-<LIEFERANT>-<ARTNR>-<FARBNR>-<BREITEcm>`; Lieferant als Pseudonym-Kuerzel `A`/`B`) | wird einmalig generiert, nie ueberschrieben |
| `shopify_product_id`, `shopify_variant_id` | implizit (Owner des Metafelds) | Shopify |
| `customer_product_name`, `customer_variant_name`, `customer_color_name` | implizit (`product.title`, `variant.title`, Option `Farbe`) | Shopify |
| `supplier` | `einkauf.lieferant` (Metaobjekt-Ref `tp_lieferant`) | neu; Werte aus `lieferant.bevorzugt` migrierbar |
| `manufacturer` | `einkauf.hersteller` | aus `lieferant.hersteller` (52 Produkte), sonst `UNGEKLAERT` |
| `supplier_product_name`, `supplier_collection` | `einkauf.lieferant_produktname`, `einkauf.lieferant_kollektion` | aus `lieferant_a_produktname` bzw. Freitext `grosshandel.sku` (halbautomatisch zerlegbar: Muster `SKU (Breite) / SKU (Breite) – Bezeichnung (Fb.NNN)`) |
| `supplier_article_number`, `supplier_sku` | `einkauf.artikelnummer` | = Varianten-SKU bei Lieferant A; bei B aus `lieferant_b_artikelnummer` |
| `supplier_color_name`, `supplier_color_code` | `einkauf.farbname`, `einkauf.farbnummer` | aus `custom.farbcode` / `tp_farbe.farbnummer` |
| `width`, `dimensions` | `custom.rollenbreite`, `custom.format_cm` (vorhanden) | Shopify |
| `order_unit` | `einkauf.bestelleinheit` (Enum: m2, lfm, stueck, paket, rolle, karton, set, paar, sondermass) | abgeleitet aus `tp-verkaufseinheit`, dann geprueft |
| `conversion_rule` | `einkauf.umrechnung` (JSON, siehe §4) | aus vorhandenen Rechnerregeln |
| `package_content` | `custom.qm_pro_paket` / `stueck_pro_paket` (vorhanden) | Shopify |
| `supplier_url` | `einkauf.lieferant_url` (Storefront NONE; darf Klarnamen-Domain enthalten, weil nie im Repo) | manuell |
| `sample_procurement_id`, `sample_supplier_sku` | `einkauf.muster_variante` (Varianten-Ref auf `muster-<handle>`) | ersetzt die reine Property-Kopplung (§5) |
| `fulfillment_route` | `einkauf.route` (Enum §36) | Standard je Produktgruppe, dann je Variante ueberschreibbar |
| `neutral_shipping_status` | `einkauf.neutralversand` (VERIFIED / UNKNOWN / NOT_ALLOWED, Default UNKNOWN) | manuell nach Pruefung §38 |
| `fallback_route` | `einkauf.route_fallback` | Default SUPPLIER_TO_TP |
| `warehouse_location` | `einkauf.lagerplatz` | manuell |
| `active`, `verified_at`, `verified_by` | `einkauf.geprueft_am`, `einkauf.geprueft_von` | manuell |

Metaobjekt `tp_lieferant`: `kuerzel` (A–D), `bestellweg` (mail/portal/pdf/csv/api), `bestell_mail`, `portal_url`, `direktversand` (ja/nein/ungeklaert), `kleinmenge_paketware`, `kleinmenge_rollenware`, `musterversand`, `hinweis`. Klarnamen und Zugangsdaten **nie** im Metaobjekt-Handle und nie im Repo; Handle = Pseudonym.

**Nicht migrieren ohne Freigabe:** `lieferant.*` bleibt bestehen, `einkauf.*` kommt dazu. Metafeld-Keys sind unveraenderlich (Memory: Konvention vorher klaeren) – deshalb wird das Schema vor dem Anlegen in `05-DECISIONS.md` D2 festgeschrieben.

## 3. Auftragszustand (Order-Ebene)

Heute existiert nichts. Soll: Order-Metafelder Namespace `ops` + Tags, damit der Zustand auch im Shopify-Admin sichtbar bleibt.

| Feld | Werte |
|---|---|
| `ops.status` | NEU → PRUEFUNG → BERATUNG_OFFEN → MASS_PRUEFUNG_OFFEN → FREIGEGEBEN → EINKAUF → WARENEINGANG → VERSAND → ABGESCHLOSSEN; daneben SPAETER, PROBLEM |
| `ops.freigabe_von`, `ops.freigabe_am` | Mitarbeiter, Zeit |
| `ops.beratung` | JSON `{gewuenscht, telefon, zeitfenster, anliegen, erledigt_am, von}` – Quelle Cart-Attribute (§6) |
| `ops.gruppen` | JSON: Fulfillmentgruppen je Position (Route, Lieferant, Einkaufs-ID) – Mischbestellungen §43 |
| `ops.problem` | JSON `{grund, seit, von}` |
| Tags | `ops:beratung`, `ops:problem`, `ops:direktversand`, `ops:teilversand` fuer Admin-Filter |

Einkaufsbestellung: Metaobjekt `tp_einkauf` (`id` Format `TP-EK-<JJMMTT>-<KUERZEL>-<NNN>`, `lieferant`, `lieferziel`, `status`, `positionen` JSON, `gesendet_am`, `bestaetigt_am`, `lieferanten_auftragsnummer`, `tracking`). Positionen verweisen auf `order_id` + `line_item_id` + `procurement_id`.

Lokale Persistenz (gitignored, Muster `.router/`): `ops/log/*.jsonl` (Audit: wer hat wann freigegeben), `ops/cache/orders.json`. Keine zweite Wahrheit fuer Stammdaten.

## 4. Mengenumrechnung – vorhandene Regeln (nicht neu erfinden)

| Gruppe | Regel im Code | Beleg |
|---|---|---|
| Rollenware | Flaeche = Breite × Laenge; ohne `preis_pro_001_qm` `Math.ceil` auf volle m², sonst 0,01 m² exakt; Laenge 100–5000 cm | `blocks/tp-rollware-rechner.liquid:1661,1844,1066,1115` |
| Paketware | Pakete = `max(1, ceil(bedarf / qm_pro_paket − ε))`, Verschnitt optional +5 % | `blocks/paket-auswahl.liquid:590`; Invariante TP-CART-001 |
| Massteppich | `ceil(area·100)` Hundertstel-m², Mindestpreis hebt Menge | `assets/tp-masstepich-rechnung.js:47,112` |
| Kante/Ketteln | `round(kanteM·100)`, bewusst nicht aufgerundet | `tp-masstepich-rechnung.js:107` |
| Kettelleiste | `ceil(2·(b+l)/100)` auf volle Meter | `tp-rollware-rechner.liquid:1450-1456` |
| Haftunterlage | `bahnen = ceil(b/breite)`, `meter = bahnen·ceil(l/100)` | `:1499-1500` |
| Leisten | Stangen = Meter / `custom.stangenlaenge` | `blocks/tp-zubehoer-menge.liquid` |
| Muster | Stueck, max. 3 | `assets/tp-sample-checkout-core.js:3` |

Lieferantenseitige Bestellmenge (Masterprompt §31–35) = **Einkaufsmenge**, nicht Kundenmenge:
- Rollenware: `lfm = ceil_to_supplier_step(laenge_cm / 100)` × Breite → `6,40 lfm × 5,00 m`. Lieferantenschritt (0,1 m? 0,5 m?) ist **UNGEKLAERT** – nicht raten.
- Paketware: bereits ganze Pakete; Mindestabnahme je Lieferant (Lieferant A teils „mind. 5 VE", B Gebinde 3,5–6 m²) **UNGEKLAERT** (`domains/lieferanten/kleinmengen-dropshipping-2026-09-10.md`).
- Leisten: Stangen aus `stangenlaenge`; 38 lfm / 2,5 m = 15,2 → 16 Stangen nur, wenn die Stangenlaenge des Artikels 2,5 m ist.

Die Umrechnung wird als reine Funktion `operations/lib/umrechnung.mjs` gebaut und mit den vorhandenen Rechner-Tests (`qa/tests/masstepich-*.test.mjs`, `cart-mengensperre.test.mjs`) gegengeprueft.

## 5. Muster → Ursprungsprodukt

Heute nur ueber Properties (`_Muster_ID`, `_Quellprodukt_ID`, `_Quellvariante_ID`, `_Bild`, `_Produktlink`) und Namensgleichheit der Option `Farbe`. Fehlt eine Farbe im Musterprodukt, faellt es auf `kostenloses-muster` (`TP-MUSTER-000`) mit Properties `Produkt`/`Farbe` zurueck – dann ist die Zuordnung nur noch Text (siehe Bestellung #1008).

Soll: `einkauf.muster_variante` auf der Quellvariante und `einkauf.quellvariante` auf der Mustervariante (beidseitig), Musterquelle `einkauf.muster_quelle` ∈ {MUSTERLAGER, AUS_ROLLE_SCHNEIDEN, LIEFERANT, NICHT_VERFUEGBAR}. Die Properties bleiben als Kundensicht.

## 6. Beratung (Masterprompt §45–48)

Kein Feld vorhanden. Checkout ist ohne Shopify Plus nicht anpassbar, daher: **Cart-Attribute** im Warenkorb (`attributes[Beratung]` = ja/nein Pflicht ohne Vorauswahl, `attributes[Telefon]`, `attributes[Zeitfenster]`, `attributes[Anliegen]`), serverseitig in der Bestellung als `order.customAttributes` lesbar → `ops.beratung`. Umsetzung im Theme (Klasse B) erst nach D9.

## 7. Produktampel (Masterprompt §26–28)

`PROCUREMENT_READY = true` nur wenn je Produktgruppe die Pflichtfelder gesetzt sind:

| Gruppe | Pflicht |
|---|---|
| Rollenware | lieferant, artikelnummer, farbnummer, rollenbreite, bestelleinheit=lfm, route |
| Paketware | lieferant, artikelnummer, farbnummer, qm_pro_paket, bestelleinheit=paket, route |
| Leisten/Zubehoer | lieferant, artikelnummer, stangenlaenge oder stueck, route |
| Muster | quellvariante, muster_quelle |
| Dienstleistung | route=NO_PROCUREMENT |

Ampel wird berechnet, nie gespeichert. Fehlende Werte heissen `UNGEKLAERT`, nie geraten.
