# Produktimport-Standard nach Fellara (Lieferant B, Stueckware)

Stand 2026-09-30. Referenzprodukt: `fellara-dekofell` (Product 16102406783310).
Jedes weitere Produkt aus der Lieferung von Lieferant B muss mindestens diesen Stand
erreichen. Lieferantennamen, Marken und Pfade stehen nur lokal:
`~/teppich-paradies-analyse/lieferantendaten/lieferant-b-import-handoff-2026-09-30.md`.

Vorher lesen: `domains/shopify/produktimport-arbeitsweise.md`, Skill `produktimport`,
`importplan-2026-09.md`, `draft-product-groups-2026-09.json` (76 Gruppen, 584 SKUs),
`import-snapshot-2026-09.json`, `domains/shopify/dekofell-template.md`.

## Routing

`npm run workflow:route` ergibt fuer den Import Klasse D: Sitzung **Opus, Effort high**,
unabhaengiges Review vor den Shopify-Schreibvorgaengen. Massenanlage und Preise sind
geschuetzte Aktionen: Freigabe des Inhabers **zu Beginn** im Chat einholen (Preisregel,
Umfang, Veroeffentlichen). Merges nach `main` blockt der Auto-Modus ohne ausdrueckliche
Freigabe im Chat.

## Checkliste je Produkt

1. **Dublettenabgleich** aller SKUs und EANs ueber alle Status (Varianten-Suche `sku:` und
   `barcode:`), nicht nur Titel. Vorhandene Entwuerfe (Velora = Gravina) wiederverwenden.
2. **Name und Stamm:** Eigenname (wie Fellara, Velora), Vendor `TeppichParadies`,
   Produkttyp `Dekofell` bzw. `Wohnteppich`, Kategorie `hg-3-57`,
   `mm-google-shopping.google_product_category = 598`, SEO-Titel/-Beschreibung.
3. **Optionen:** `Farbe` (deutsche Farbnamen, am Bild pruefen) und `Größe` im Format
   `80 × 150 cm`, `Ø 160 cm rund`, `40 × 60 cm Fellform` – `tp-groessen-form` liest
   Mass und Form genau aus diesem Format.
4. **Preis:** Regel siehe unten. Kein Vergleichspreis.
5. **Varianten:** SKU = neue Artikelnummer, Barcode = EAN, Gewicht aus der Datenliste,
   Metafeld `custom.farbcode` (Farbcode abgeschrieben), Bestand nicht verfolgt.
6. **Metafelder:** `custom.material` (Text), `custom.fasermaterial`, `custom.arten`
   (Teppich-Art, z. B. „Dekofell“), `custom.zimmer`, `custom.fusbodenheizung` (nur wenn
   belegt), `shopify.color-pattern` (auf vorhandene Grundfarben abbilden),
   `custom.merkmale` (max. 4 belegte Merkmale), `custom.bildnachweis` (Wortlaut laut
   Bildbedingungen der Marke), `grosshandel.sku` (Lieferantenlinie). Fehlende Metaobjekte
   (z. B. Fasermaterial Viskose) anlegen, Status ACTIVE.
7. **Tags:** `art: …`, `farbe: …`, `material: …`, `raum: …`, `eignung: …`, `ohne-muster`.
8. **Beschreibung:** `pd-card` mit Kurztext, drei Badges, Tabelle `pd-specs`; nur
   Lieferantenangaben; geschuetzte Leerzeichen in `30 °C`, `100 %`, `40 × 60 cm`.
9. **Bilder:** nur exakter Design- **und** Farbcode, nie ein aehnliches Muster.
   Je Farbe kuratieren: Freisteller je Groesse/Form als Variantenbild, dazu 2–3 Raumbilder,
   Detail, Rueckseite. Jedes Bild ansehen – Archive enthalten falsch beschriftete Dateien
   (Fellara: Rueckseite „beige“ zeigt ein graues Fell). EXIF-Drehung anwenden, lange Seite
   2400 px, JPEG q86, Dateiname `<handle>-<farbe>-<motiv>.jpg` ohne Lieferantennamen.
   Alt-Text `<Name>, <Farbe>, <Motiv>` – er muss genau **eine** Farbe des Produkts nennen
   und darf kein anderes Farbwort enthalten (die Galerie blendet fremde Farben ueber den
   Alt-Text aus; „Goldschale“ wuerde als Gold zaehlen). Titelbild = aussagekraeftigster
   Freisteller.
10. **Template:** Dekofelle `dekofell`. Wohnteppiche: `product.wohnteppich` erst auf den
    Aufbau von `dekofell` bringen (Farbkreise, `tp-groessen-form`, Merkmale, Bildnachweis,
    keine Empfehlungen, kein Verlegeservice) oder `dekofell` verwenden – vorher mit vielen
    Groessen (bis 7) und runden Formaten im Arbeitstheme pruefen, `rund_zoom` an die
    Freisteller anpassen.
11. **Kollektion:** `wohnteppiche` (manuell).
12. **Veroeffentlichen:** erst `UNLISTED` + Onlineshop veroeffentlichen, auf der Live-Seite
    pruefen, dann `ACTIVE`.
13. **Gegenprobe:** Variantenzahl, SKU, EAN, Preis, Medien READY, Variantenbilder,
    Metafelder, Kollektion, Filter auf der Kollektionsseite, Warenkorbtest (hinzufuegen,
    SKU/Preis pruefen, wieder entfernen), Handy 375 px.

## Preisregel (Inhaber 2026-09-30 fuer Fellara)

Lieferant B berechnet je Sendung eine Dropship-Gebuehr (Betrag lokal). Sie wird voll auf den
Artikel umgelegt, damit eine Einzelbestellung dieselbe Marge wie beim UVP ohne Gebuehr hat:

`VK = UVP + (Gebuehr netto − Versandertrag netto) × 1,19`, auf ,99 aufgerundet.

Fellara: +9,29 € auf UVP (5,99 → 15,99; 11,99 → 21,99; 19,99 → 29,99). Ab 50 € ist der
Versand frei, dann faellt der Versandertrag weg. Vor dem naechsten Import die Regel fuer
Artikel ab 50 € mit dem Inhaber bestaetigen.

## Technik, die funktioniert hat

- Bilder: `stagedUploadsCreate` (PUT) → `curl -X PUT -H "Content-Type: image/jpeg"`
  (**kein** `x-goog-acl`-Header, sonst 400) → `productCreateMedia` je 15 Bilder.
- Skriptbare Schreibvorgaenge: `shopify store execute -s <store> --query-file … --variable-file … -j --allow-mutations --output-file …`.
- zsh trennt `$VAR` nicht an Leerzeichen: Dateilisten fuer `theme push --only` per Bash-Array.
- Excel ohne Zusatzpakete: `.xlsx` ist ein ZIP (sharedStrings.xml + sheet1.xml).
- Storefront zeigt neue Preise erst nach rund einer Minute.
