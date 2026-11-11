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

**Vorbereiteter Endpreisvertrag, 23.10.2026 (#1283/#1290):** Je Farbe eine bestellbare
Beispielgroesse (80 x 150, 120 x 170, 160 x 230 oder 200 x 300 cm, ohne angehobene
Mindestpreis-Menge), vollstaendiger Endpreis inklusive Einfassung/Pauschale und
`?variant=&breite=&laenge=`. Product-JSON-LD, og:price und vorbelegter Konfigurator
muessen dazu passen. Dies ist eine koordinierte Umstellung, kein Nachweis des Live-Zustands.

Der **bestehende** OAuth-Tagesworkflow `feed-tnm-preise.yml` nutzt
`operations/scripts/feed-tnm-abruf.mjs` und denselben Rechen-/Seitenabgleich wie
`scripts/teppich-nach-mass-feed.mjs`. Auf `feed-daten` bleiben die produktiven Namen
`tp-tnm-preise.txt` (Google-Zusatzquelle) und `tp-tnm-meta.tsv` (eigenstaendiger
zwoelfspaltiger Meta-Vollkatalog) erhalten. Beide Dateien und `tp-tnm-pruefung.json`
werden nur gemeinsam nach erfolgreicher Komplettpruefung veroeffentlicht. Nicht
lieferbare Farben bleiben mit eindeutiger Verfuegbarkeit enthalten.
Bestandsgebundene Sonderposten verwenden zusaetzlich den vorhandenen Rollenzuschnitt-
Abgleich: genau eine Rollenbreite, gleicher Bundlepreis (0 oder eine Materialeinheit)
und eine verfuegbare, ausreichend lange Zuschnittvariante fuer das Beispielmass.
Eine fehlende Vorher-ID benoetigt einen aktuellen Admin-Nachweis: archiviert, Entwurf, geloescht
oder andere Produktart. Fehlende aktive TNM-Varianten, fehlende Bilder, Preis- oder
Vergleichspreisabweichungen und Aenderungen waehrend der Erzeugung brechen ab.
Der alte schreibende m2-Pfad `feed:titel -- --tnm-aus` ist gesperrt.

Lokal: `npm run -s feed:teppich-nach-mass [-- --theme <id>]` oder
`--katalog <json>` fuer einen ausdruecklich ueber den bestehenden MCP gelesenen
Vollkatalog. Format: `{"format":"tp-tnm-katalog-v1","complete":true,"capturedAt":"<ISO>","products":[...]}`.
Der Export darf hoechstens 30 Minuten alt sein; jedes Produkt enthaelt `id`,
`productType`, `status`, `updatedAt`, `handle`, `title`, `onlineStoreUrl`,
`description`, `vendor`, `featuredMedia.preview.image.url` und eine vollstaendige
`variants`-Liste mit `id`, `price`, `compareAtPrice`, `availableForSale`,
`selectedOptions`, `image.url`. Keine Tokens oder neue Scopes dafuer suchen.
Die lokale Ausgabe ist ein Pruef-/Vorbereitungsergebnis und publiziert keinen Kanal.

Der Seitenabruf laeuft seriell mit mindestens 1.500 ms zwischen allen HTTP-
Requeststarts, einschliesslich Weiterleitungen. Es gibt dabei keinen automatischen
HTTP-Retry. Der erste 429 beendet den gesamten Lauf; `Retry-After` und die Zahl der
ungeprueften Produkte bleiben im vollstaendigen Actions-Pruefprotokoll erhalten.
Vor einem bewusst neu gestarteten Lauf die dort angegebene Wartezeit beachten.

**Vor dem koordinierten Livewechsel zwingend:**

**Belegter Vorbereitungsstand nach Sortimentsentnahme, 23.10.:** Der vollstaendige
Seitenlauf pruefte zunaechst 424 Produkte / 4.619 Varianten. Danach wurden drei
Massprodukte aus einer bestaetigt ausgelaufenen Linie autoritativ als `ARCHIVED`
gegengelesen. Ein neuer vollstaendiger Adminabruf enthaelt 421 Produkte / 4.616
Varianten; alle verbleibenden gelesenen Felder einschliesslich Preisen,
Vergleichspreisen, Verfuegbarkeit und `updatedAt` stimmen mit dem geprueften
Snapshot ueberein. Der vorhandene Vorher-ID-Guard akzeptiert ausschliesslich
diese drei belegten Entnahmen. Die vorbereiteten Dateien wurden ohne erneuten
Massencrawl daraus abgeleitet; Manifest und Abnahme trennen Seitenlauf und
frischen Adminabgleich. Das ist kein Produktiv- oder Kanalverarbeitungsnachweis.

1. Aktuellen Komplettlauf gegen das Kandidaten-Theme und danach Live pruefen;
   keine ungeklaerten Auslassungen. Alten Quellen-/Regelstand fuer Ruecknahme sichern.
2. Die blinde stuendliche Shopify-Flow-Publikation neuer TNM-Produkte anhalten oder
   durch eine bestaetigte Zulassung nach Feed-Verarbeitung ersetzen. Das Manifest
   allein erteilt keine Freigabe. Zwischen Import/Preis-/Aktionsaenderung und
   verarbeitetem Feed darf kein Rohpreis-Angebot neu publiziert werden.
3. MC: Endpreisquelle fuer Titel, Link, price, sale_price, beide Einheiten und
   availability verwenden; alte TNM-x100-Regeln entfernen. `feed:titel` ohne TNM
   neu verarbeiten lassen. Meta bleibt auf derselben Vollkatalogquelle/IDs.
4. Theme, beide produktiven Feeds und Kanalregeln im selben Cutover umstellen;
   Quellen sofort neu einlesen lassen. Ein Feed-Commit ist kein Kanal-Ingest.
   Nach jedem Import und Preis-/Aktionswechsel einschliesslich Aktionsende denselben
   vorhandenen Workflow ausloesen und die Verarbeitung bestaetigen.
5. Verarbeitete Artikel und frischen Google-Crawl anhand exakter IDs kontrollieren:
   Endpreis = Beispiel auf Seite, korrekte sale_price-Leerung, Masse/Link/Einheiten,
   Verfuegbarkeit und Meta-Gruppierung. Shopify-Rohpreise in `content_for_header`
   bleiben bestehen; ein erneuter falscher Crawl ist ein offener Fehler.
   Erst dann die abgesicherte Publikation fuer validierte Produkte oeffnen.

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

## Laeufer, Treppenkanten und Matten nach Mass (Werkbank w-331)

Diese Produkte (Adresse enthaelt `nach-mass`, Produktart nicht „Teppich nach Maß“) haben
einen Variantenpreis je cm bzw. je 0,01 m² und standen mit 0,18 bis 1,76 EUR in Shopping.

- **Sperre (seit 2026-11-11):** Merchant Center → Datenquelle „Shopify App API“ →
  Attributregel „ausgeschlossenes Ziel“: Produkttyp enthaelt nicht „Teppich nach Maß“ UND
  Link enthaelt „nach-mass“ → Shopping-Anzeigen, kostenlose Eintraege, Display.
- **Beispielpreis (Inhaber 2026-11-11):** Laeufer 200 cm lang mit Einfassung und
  Pauschale, Matte 60 × 90 cm, Treppenkante 3 × 100 cm (= Mindestgesamtlaenge im
  Zuschnitt). Quelle auf der Seite: `snippets/tp-laengen-beispiel.liquid` bzw.
  `snippets/tp-mass-beispiel.liquid` (Matten) in Product-JSON-LD und og:price; der Link
  `?variant=&laenge=&anzahl=` bzw. `?variant=&breite=&laenge=` belegt den Rechner vor.
- **Zusatzquelle:** `operations/scripts/feed-nachmass-abruf.mjs` (lokal
  `npm run -s feed:nachmass -- --aus … --pruefung …`) schreibt im Tageslauf
  `.github/workflows/feed-tnm-preise.yml` die Datei `tp-nachmass-preise.txt` auf den
  Zweig `feed-daten`, mit denselben Spalten wie `tp-tnm-preise.txt`. Bei einer einzigen
  Abweichung zwischen JSON-LD, Rechner und Admin-Preis bleibt die alte Datei stehen.
- **Freigeschaltet im Merchant Center (2026-11-11):** ergaenzende Quelle
  „tp-nachmass-preise (automatisch)“, Abruf taeglich 07:00 Uhr; sie steht in den
  Attributregeln fuer price, sale_price, title, link, unit_pricing_measure und
  unit_pricing_base_measure vorn. Die Sperre bleibt und hat eine dritte Bedingung:
  „`tp-nachmass-preise (automatisch).price` enthaelt nicht 'EUR'“ (einen Operator „hat
  keinen Wert“ gibt es nicht; die Spalte steht im Editor unter „Feedattribute“). Was der
  Feed nicht liefert, bleibt aus Shopping (das Skript hat deshalb keinen Vorher-Abgleich).
- **Titel:** Produkttitel, alle Optionswerte (Farbe, Staerke, Ausfuehrung), Beispielgroesse.

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
