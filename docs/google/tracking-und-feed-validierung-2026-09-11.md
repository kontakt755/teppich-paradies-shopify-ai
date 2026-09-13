# Google: Tracking und Merchant-Feed – Validierungsbericht 2026-09-11

Bezug: #44 (GA4-Setup, Events `view_item`, `add_to_cart`, `purchase`) und #43
(Merchant Center, nächster Schritt „Validierungsbericht dokumentieren").

Stand: Theme-Code auf `origin/main` (6f2f137), Shopify Admin API und ShopifyQL am
2026-09-11, ausschließlich lesend. Kein Zugang zu Google-Konten (GA4, Google Ads,
Merchant Center) – was nur dort prüfbar ist, steht getrennt in Abschnitt 3.

## Kurzfassung

| # | Befund | Wirkung auf Google Ads |
|---|---|---|
| 1 | Es gibt keinen belegten Kauf-Datenstrom. Seit Februar 3 Bestellungen (0,00 €, 5,99 €, 0,00 €), seit dem 25.02. keine mit Warenwert. In 90 Tagen 5.258 Sitzungen, 40 mit Warenkorb, 15 im Checkout, 0 abgeschlossen. Welche Pixel GA4/Ads bedienen, ist per API nicht lesbar. | hoch – Gebotsstrategien auf Conversions haben keine Datenbasis |
| 2 | Alle 225 Produkte im Kanal Google & YouTube stehen auf `awaiting_review`, keines auf `approved` oder `published`; die App liefert kein Produkt-Feedback. | blockierend – ohne freigegebene Artikel keine Shopping-/PMax-Produktanzeigen |
| 3 | 225 von 225 Kanalprodukten ohne GTIN/Barcode und ohne Kennzeichnung „benutzerdefiniertes Produkt". | hoch – Warnung „fehlende Kennzeichnung", eingeschränkte Auslieferung |
| 4 | 8 SKUs doppelt vergeben (16 Klickvinyl-Produkte, 15 davon im Kanal); 41 Klebevinyl ohne SKU. | mittel – Duplikate, keine MPN |
| 5 | 2 Klickvinyl mit abweichendem Einheitspreis-Maß (Metafeld 2,2 m², Shopify-Einheitspreis 1,892 m²). | mittel – €/m² in Shopping ≠ Produktseite |
| 6 | Sonst vollständig: Marke, Kategorie, Hauptbild, Preis > 0, Verfügbarkeit, Beschreibung ≥ 150 Zeichen im Kanal. Rollenware (122) ist korrekt ausgeschlossen, keine `opc-*`-Variante mehr. | – |
| 7 | Die Häkchen in #43 („Alle Produkte indexed", „No data quality issues") sind nicht belegt; `automation/reports/MERCHANT_CENTER_VALIDATION.md` beruht auf drei fest eingebauten Testprodukten, nicht auf Shopdaten. | Dokumentationsrisiko |

## 1. Tracking (GA4, Google Ads) – #44

### 1.1 Was das Theme selbst misst

| Prüfung (Theme auf `origin/main`) | Ergebnis |
|---|---|
| `gtag(`, `G-…`, `AW-…`, `GTM-…`, `googletagmanager`, `fbq(` | 0 Treffer |
| `window.dataLayer` | nur `snippets/tp-lead-events.liquid` |
| `Shopify.analytics.publish` | nur `snippets/tp-lead-events.liquid`: `tp_lead_call`, `tp_lead_whatsapp`, `tp_lead_mail`, `tp_lead_contact_click`, `tp_lead_form_submit` |
| App-Embeds in `config/settings_data.json` | Mega-Menü und Preisrechner – kein Tracking-Embed |
| externe Scripts in `layout/theme.liquid` | keine Tracking-Scripts |

Folge: Das Theme erzeugt **kein** E-Commerce-Ereignis für GA4 oder Ads.
`view_item`, `add_to_cart`, `begin_checkout` und `purchase` können nur aus den
Shopify-Kundenereignissen kommen (Standard-Events `product_viewed`,
`product_added_to_cart`, `checkout_started`, `checkout_completed`), die ein
App-Pixel – bei diesem Shop naheliegend die Google-&-YouTube-App – an GA4/Ads
weitergibt. Die Lead-Ereignisse wirken nur, wenn ein Custom Pixel sie abonniert
(Vorlage: `docs/analyse/service-funnel-events.md`).

### 1.2 Was die Admin API zeigt

| Abfrage | Ergebnis |
|---|---|
| `webPixel`, `serverPixel` | verweigert – Scope `read_pixels` fehlt; welche Pixel existieren, ist per API nicht feststellbar |
| `appInstallations` | verweigert |
| Vertriebskanäle | Onlineshop, Shop, Point of Sale, **Google & YouTube** – die Google-App ist installiert |
| Shop | Währung EUR, Sprache `de` (einzige, primär), Markt Deutschland – Feed-Sprache und Zielland passen |
| Bestellungen gesamt | 3: 16.02. 0,00 €, 25.02. 5,99 €, 25.08. 0,00 € (drei Muster) |

Der letzte Laufzeitbeleg bleibt der öffentliche Test vom 12.08.
(`TRACKING_REPORT.md`): nach Zustimmung ein App-Pixel und ein Custom Pixel, vor
Zustimmung keine Google-Endpunkte.

### 1.3 Event-Abdeckung und Stand der Checkliste in #44

| Punkt in #44 | Erwartete Quelle | Stand | prüfbar in |
|---|---|---|---|
| GA4-Property erstellt | – | unbekannt | GA4, Kanal Google & YouTube |
| Verknüpfung mit Google Ads | – | unbekannt | GA4 → Produktverknüpfungen, Google Ads |
| `view_item` | `product_viewed` über App-Pixel | technisch erwartet, nicht belegt | GA4-DebugView |
| `add_to_cart` | `product_added_to_cart` über App-Pixel | Shopify zählt 40 Sitzungen mit Warenkorb – die eigenen Kaufblöcke (`/cart/add.js`) werden also als Warenkorbereignis erkannt; Weitergabe an GA4 nicht belegt | GA4-DebugView |
| `begin_checkout` | `checkout_started` | 15 Sitzungen erreichten den Checkout; Weitergabe nicht belegt | GA4-DebugView |
| `purchase` | `checkout_completed` | höchstens einmal mit Wert > 0 möglich gewesen (5,99 € am 25.02.) | Testkauf |
| `tp_lead_*` | Theme → Custom Pixel | Theme veröffentlicht; ob ein Pixel abonniert, nicht belegt | Kundenereignisse, GA4-Echtzeit |

Doppelzählung droht, wenn GA4 zugleich über die Google-&-YouTube-App und über ein
Custom Pixel mit eigenem `gtag` Kaufereignisse erhält, oder wenn Google Ads die
Kauf-Conversion sowohl direkt aus der App als auch als GA4-Import primär zählt.
Beides ist nur in den Kundenereignissen bzw. in Google Ads sichtbar.

ShopifyQL, 90 Tage bis 2026-09-11, nach Herkunft:

| Herkunft | Sitzungen | mit Warenkorb | Checkout erreicht |
|---|---:|---:|---:|
| direkt | 2.506 | 32 | 13 |
| Suche | 2.365 | 8 | 2 |
| Social | 367 | 0 | 0 |
| unbekannt | 20 | 0 | 0 |

Auffällig: Die Musterbestellung vom 25.08. liegt im Zeitraum, ShopifyQL zählt
trotzdem 0 abgeschlossene Checkouts – die Bestellung ist keiner Sitzung
zugeordnet. Auch deshalb muss ein Testkauf die Kette belegen, bevor Zahlen als
belastbar gelten.

### 1.4 Welcher Wert an GA4 geht (Paket vs. €/m²)

Shopify-Standard-Events tragen den Variantenpreis und die Warenkorbmenge; der
Zeilenwert ist Menge × Variantenpreis. Was das je Produktart bedeutet, folgt aus
den Kaufblöcken des Themes:

| Produktart | Kaufblock | `price` im Ereignis | `quantity` | `value` (`add_to_cart`, `purchase`) | `view_item` |
|---|---|---|---|---|---|
| Paketware (Klick-/Klebevinyl; `custom.qm_pro_paket` an 227 Produkten) | `blocks/paket-auswahl.liquid` | Paketpreis, z. B. 105,98 € für 2,08 m² | Anzahl Pakete | Pakete × Paketpreis = Warenkorbwert | Paketpreis |
| Rollenware (122 Produkte) | `blocks/tp-rollware-rechner.liquid` | €/m² der gewählten Breite | aufgerundete m² | m² × €/m² = Zeilensumme | nur €/m², nicht der Kaufpreis |
| Rollenware cm-genau (`custom.preis_pro_001_qm`) | dito | Preis je 0,01 m² | 0,01-m²-Einheiten | korrekt | Kleinstbetrag |
| Wunschmaß-Teppich (`custom.wunschmass_mindestbreite_cm`) | `blocks/tp-teppich-wunschmass.liquid` | Preis je 0,01 m² | Einheiten | korrekt | Kleinstbetrag |
| Muster (`kostenloses-muster`, unlisted) | `assets/tp-sample-checkout.js` | 0,00 € | 1 je Muster | 0,00 € | – |

Einordnung:

- Der Umsatzwert stimmt in allen Fällen mit dem Warenkorb überein. Bei Paketware
  erscheint der €/m²-Preis in keinem Ereignis; auch der Feed-`[price]` ist der
  Paketpreis – Ereignis und Feed passen zusammen. Kein Theme-Umbau nötig.
- cm-genaue Rollenware und Wunschmaß sind derzeit an **0** aktiven Produkten
  eingeschaltet. Würden sie aktiviert, zeigte GA4 Artikelpreise im Cent-Bereich
  mit drei- bis vierstelligen Mengen: Umsatz richtig, Artikelberichte und
  dynamisches Remarketing unbrauchbar. Vor dem Einschalten klären.
- `view_item` bei Rollenware trägt nur den €/m²-Grundpreis – für wertbasierte
  Zielgruppen ungeeignet, für Conversions unerheblich.
- **Musterbestellungen** lösen ein `purchase` mit 0 € aus (die Bestellung vom
  25.08. ist eine). Ist „Kauf" in Google Ads die primäre Conversion, zählen Muster
  als Conversion ohne Wert und verzerren die Gebote. Muster gehören in eine
  eigene, sekundäre Conversion.

## 2. Merchant-Center-Feed – #43

### 2.1 Veröffentlichung im Kanal Google & YouTube

| | Produkte |
|---|---:|
| aktiv gesamt | 401 (von 435) |
| im Onlineshop veröffentlicht | 402 (inkl. unlisted Musterprodukt) |
| im Kanal Google & YouTube | **225** = 141 Klebevinyl + 84 Klickvinyl |
| nicht im Kanal | 176 = 122 Rollenware (50 Teppichboden, 63 Vinyl von der Rolle, 9 Linoleum) + 52 Zubehör/Leisten + 1 Teppichfliese + 1 Klickvinyl (`marlow-eiche-blond-klickvinyl-7mm`) |

Rollenware ist damit wie in `GOOGLE_ROLLENWARE_EXCLUSION_PLAN.md` vorgesehen
ausgeschlossen; eine `opc-*`-Variante existiert nicht mehr.

**Kanalstatus der 225:** `awaiting_review` 225 · `approved` 0 · `published` 0 ·
`needs_action` 0 · `rejected` 0 · `demoted` 0. Das Produkt-Feedback der App ist
leer. Ob Google die Artikel prüft und ob das Merchant-Center-Konto überhaupt
verifiziert und verknüpft ist, zeigt nur der Kanal bzw. das Merchant Center.
Solange kein Artikel freigegeben ist, laufen weder Shopping- noch
PMax-Produktanzeigen.

### 2.2 Feldqualität

Grundlage: alle 401 aktiven Produkte mit ihren 1.726 Varianten (von 3.274
Varianten im Shop). „Kanal" = die 225 Produkte mit je einer Variante im
Google-&-YouTube-Kanal.

| Kriterium | alle aktiven | im Kanal | Beispiele (Handles) |
|---|---|---|---|
| GTIN/Barcode fehlt | 1.464 von 1.726 Varianten | **225 von 225** | `alvora-eiche-bernstein-klebevinyl-2-5mm`, `marlow-eiche-nordisch-klickvinyl-7mm`, `bergen-eiche-grau-klickvinyl-6mm` |
| Kennzeichnung „benutzerdefiniertes Produkt" (`mm-google-shopping.custom_product`) | 0 | 0 | – |
| SKU fehlt (keine MPN-Grundlage) | 41 Varianten, alle Klebevinyl | 41 | `alvora-eiche-bernstein-klebevinyl-2-5mm`, `alvora-eiche-cognac-klebevinyl-2-5mm`, `alvora-eiche-frost-klebevinyl-2-5mm` |
| dieselbe SKU an verschiedenen Produkten | 8 SKUs an 16 Produkten (Klickvinyl 7 mm, je Farbe zwei Produkte) | 15 Produkte | `marlow-eiche-hell-klickvinyl-7mm` und `turku-eiche-hell-klickvinyl-7mm`; ebenso `…-creme-…`, `…-nordisch-…` |
| Marke (Vendor) leer | 0 | 0 | – |
| Marke = Shopname „TeppichParadies" | 168 (Rollenware, Zubehör, 2 Klickvinyl) | 2 | `rovelia-eiche-hell-klickvinyl-10mm`, `rovelia-eiche-braun-klickvinyl-10mm` |
| Produktkategorie (Shopify-Taxonomie) fehlt | 0 | 0 | Bodenbeläge: „Fußböden & Teppichböden" (355) |
| Hauptbild fehlt | 0 | 0 | – |
| Beschreibung < 150 Zeichen | 1 | 0 | `livano-eiche-grau-vinylboden-von-der-rolle` (142 Zeichen, Rollenware) |
| Preis 0 | 0 | 0 | Musterprodukt (0 €) ist unlisted und nicht im Kanal |
| nicht verfügbar | 0 | 0 | alle Varianten verkaufbar – Google sieht durchgehend „auf Lager" |
| Einheitspreis fehlt (Paketware) | 0 von 236 Paketvarianten | 0 | – |
| Einheitspreis-Maß ≠ `custom.qm_pro_paket` | 2 | 2 | `verona-terrazzo-grau-klickvinyl-6mm`, `verona-terrazzo-schwarz-klickvinyl-6mm` (2,2 m² gegen 1,892 m²) |
| `opc-*`-Varianten | 0 | 0 | – |
| Titel > 150 Zeichen | 0 | 0 | – |

Barcodes gibt es nur an 47 Zubehör- und Linoleumprodukten (262 Varianten),
keines davon im Kanal. 8 davon sind 15-stellig, 18 nicht rein numerisch – als
GTIN ungültig. Das wird relevant, sobald Zubehör in den Kanal soll. Beispiele für
Produkte mit Barcode: `abschlussprofil-aluminium-gebohrt-47-mm`,
`abschlussprofil-aluminium-schraubbar-7-15-mm`,
`abdeckvlies-saugstark-mit-antirutsch-ruecken`.

Preislogik, weiterhin korrekt: Feed-`[price]` = Shopify-Variantenpreis =
Paketpreis; der Einheitspreis kommt aus dem Shopify-Einheitspreis (`showUnitPrice`,
Maß in m²) und ist an allen 236 Paketvarianten gesetzt. Strukturierte Daten:
Paketware liefert das Offer zum Paketpreis, Rollenware und Wunschmaß unterdrücken
es (`snippets/tp-product-structured-data.liquid`).

### 2.3 Einordnung nach Wirkung auf Google Ads

| Wirkung | Befund | Warum |
|---|---|---|
| blockierend | 0 von 225 Artikeln freigegeben | Shopping/PMax spielen nur aktive Artikel aus |
| hoch | keine GTIN und keine Kennzeichnung bei 225 von 225 | Google verlangt für Markenware die GTIN; wo keine existiert, `identifier_exists = no`. Fehlt beides: Warnung und geringere Auslieferung, bei als Markenware erkannten Artikeln Ablehnung |
| mittel | 8 doppelte SKUs (15 Kanalprodukte) | dieselbe Ware zweimal im Feed konkurriert mit sich selbst; Duplikatverdacht |
| mittel | 41 Klebevinyl ohne SKU | ohne SKU keine MPN, falls der Weg „Marke + MPN" gewählt wird |
| mittel | Einheitspreis-Maß bei 2 Produkten abweichend | Shopping zeigt einen anderen €/m²-Wert als die Produktseite |
| niedrig | Marke „TeppichParadies" bei 2 Klickvinyl | uneinheitlich – die übrigen Klickvinyl tragen ihren Produktnamen als Marke |
| niedrig | 1 kurze Beschreibung, ungültige Barcodes bei Zubehör | betrifft keine Kanalprodukte |

### 2.4 Was an bestehenden Unterlagen nicht stimmt

- **#43**: Die vier Häkchen (Konto OK, Feed-Validierung läuft, alle Produkte
  indexed, keine Datenqualitätsprobleme) haben keinen Beleg im Repo; die Admin API
  widerspricht zweien davon (0 freigegebene Artikel, 225 ohne Kennzeichnung). Bis
  ein Nachweis aus dem Merchant Center vorliegt, gelten sie als offen.
- `automation/reports/MERCHANT_CENTER_VALIDATION.md` („3 Produkte, 66,7 %")
  stammt aus `automation/scripts/validate-merchant-center-feed.mjs`, das drei fest
  eingebaute Beispielprodukte prüft, eines davon absichtlich defekt. Kein
  Shopbezug – nicht als Validierung zitieren.
- `automation/scripts/verify-google-ads-tracking.mjs` sucht „GA4" in
  `config/settings_data.json` (0 Treffer), `utm_*` in `snippets/meta-tags.liquid`
  (0 Treffer) und `assets/conversion-tracking.js` (existiert nicht). Das Ergebnis
  sagt nichts über das tatsächliche Tracking aus.
- `docs/GOOGLE_ADS_TODAY.md` erwartet „≥ 500" Produkte im Merchant Center. Mit
  ausgeschlossener Rollenware ist 225 der Sollwert.

## 3. Nur im Google-Konto oder Shopify-Admin prüfbar (Inhaber)

Shopify-Admin (Browser):

1. **Einstellungen → Kundenereignisse:** jedes Pixel mit Name, Typ (App/Custom),
   Status und Berechtigung. Fertig, wenn feststeht, welches Pixel GA4 und welches
   Ads bedient und ob zwei dasselbe Ziel bedienen.
2. **Vertriebskanal Google & YouTube:** verknüpftes Merchant-Center-Konto,
   Google-Ads-Konto, GA4-Property, Status „Conversion-Tracking"; Produktstatus
   (genehmigt/ausstehend/abgelehnt) samt Grund für „ausstehend".
3. **Einstellungen → Kundendatenschutz:** Cookie-Banner für die EU aktiv,
   Zustimmung erforderlich?

Merchant Center:

4. Kontostatus (verifiziert, beansprucht, Warnungen, Sperren) und Datenquellen
   (nur Shopify-App oder zusätzlich ein automatischer Website-Feed).
5. Diagnose: aktive, ausstehende und abgelehnte Artikel, die drei häufigsten
   Probleme. Stichprobe `marlow-eiche-nordisch-klickvinyl-7mm`: `[price]` muss
   105,98 € sein, `[unit_pricing_measure]` 2,08 sqm.
6. Versand- und Rückgabeeinstellungen gegen die Versandregeln im Shop abgleichen.

GA4:

7. Verwaltung → Datenstreams (Mess-ID) und → Produktverknüpfungen → Google Ads.
8. Schlüsselereignisse: `purchase`, `tp_lead_call`, `tp_lead_form_submit`.

Google Ads:

9. Ziele → Conversions: genau eine primäre Kauf-Conversion (Quelle Shopify-App
   oder GA4-Import, nicht beide primär), Wert aus der Transaktion, erweiterte
   Conversions. Musterbestellungen als sekundäre Aktion.

Testkauf:

10. Ablauf nach `docs/analyse/messung-checkliste-2026-09-09.md`, Abschnitt C: je
    genau ein `view_item`, `add_to_cart` (Paketpreis × Pakete), `begin_checkout`
    und `purchase` in der GA4-DebugView, dieselbe Transaktions-ID in Google Ads.
    Erst danach die Häkchen in #44 setzen.

## 4. Nächste Schritte

Inhaber:

1. Kanal Google & YouTube öffnen und den Grund für „ausstehend" klären (Punkte 2,
   4, 5). Ohne freigegebene Artikel keine Produktanzeigen – das zuerst.
2. Pixel-Liste und Kontoverknüpfungen notieren (Punkte 1, 2, 7). Konto-IDs nicht
   ins öffentliche Repo schreiben.
3. Testkauf (Punkt 10). Der Rabattcode aus der Checkliste steht im öffentlichen
   Repo und ist einmal einlösbar – vorher prüfen, ob er noch unbenutzt ist.
4. Entscheiden, ob es für die Paketware Hersteller-GTINs gibt. Wenn nein:
   Kennzeichnung „benutzerdefiniertes Produkt" für die 225 Kanalprodukte.

Agent, nach Freigabe (schreibend, daher nicht Teil dieser Analyse):

5. Kennzeichnung bzw. GTINs setzen – nur belegte Werte, keine GTIN erfinden.
6. Die 8 doppelten Klickvinyl-Paare klären: beabsichtigte zweite Linie oder
   Dublette; gegebenenfalls je Paar eines vom Kanal nehmen.
7. SKUs der 41 Klebevinyl nachtragen (SKU-Änderung braucht Freigabe laut
   `AGENTS.md`).
8. `verona-terrazzo-*`: richtige m² je Paket aus dem Datenblatt klären, dann
   Metafeld oder Einheitspreis angleichen.
9. `validate-merchant-center-feed.mjs` auf Admin-API-Daten umstellen (Abfragen
   unten) oder den Report als Testfixture kennzeichnen;
   `verify-google-ads-tracking.mjs` ebenso.

## Anhang: Abfragen zum Wiederholen (nur lesend)

```graphql
# Kanäle und Produkte im Google-Kanal
query { channels(first: 10) { nodes { name handle app { id } } } }
query { productsCount(query: "status:active AND published_status:google-published", limit: null) { count } }

# Kanalstatus; APP_ID = Zahl aus channels.app.id des Google-Kanals
query { productsCount(query: "status:active AND product_publication_status:APP_ID-awaiting_review", limit: null) { count } }

# Feldqualität je Variante (paginieren, sortKey: ID)
query { productVariants(first: 250, sortKey: ID) { pageInfo { hasNextPage endCursor }
  nodes { sku barcode price availableForSale showUnitPrice
    unitPriceMeasurement { quantityValue quantityUnit } product { id status } } } }
```

```
FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout,
  sessions_that_completed_checkout SINCE -90d UNTIL today
```

Nicht per API lesbar: Pixel (`read_pixels` fehlt), installierte Apps, Status im
Merchant Center, GA4, Google Ads.
