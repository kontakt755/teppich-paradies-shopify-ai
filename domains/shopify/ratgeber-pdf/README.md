# Kurz-Ratgeber zur Bestellung (PDF)

Jede Warenbestellung bekommt in der Bestellbestätigung je Bodenart einen
Kurz-Ratgeber als PDF: zwei Seiten A4 mit Logo – vorbereiten, verlegen, pflegen,
Kontakt. Muster und Zubehör bekommen keinen.

| Ratgeber | Produkttypen | Datei |
|---|---|---|
| Teppichboden | Teppichboden | `ratgeber-teppichboden.pdf` |
| Ihr neuer Teppich | Teppich, Wohnteppich, Teppich nach Maß, Läufer nach Maß | `ratgeber-teppich.pdf` |
| Vinyl von der Rolle | Vinyl von der Rolle | `ratgeber-vinyl-von-der-rolle.pdf` |
| Klickvinyl | Klickvinyl | `ratgeber-klickvinyl.pdf` |
| Klebevinyl | Klebevinyl | `ratgeber-klebevinyl.pdf` |
| Laminat | Laminat | `ratgeber-laminat.pdf` |
| Parkett | Parkett | `ratgeber-parkett.pdf` |
| Linoleum | Linoleumboden | `ratgeber-linoleum.pdf` |
| Kautschuk | Kautschukboden | `ratgeber-kautschuk.pdf` |
| Korkboden | Kork | `ratgeber-kork.pdf` |
| Kunstrasen | Kunstrasen | `ratgeber-kunstrasen.pdf` |
| Sauberlauf | Sauberlauf | `ratgeber-sauberlauf.pdf` |

Ohne Ratgeber: Dekofell (ein Produkt) und Zubehör – das erklärt der Ratgeber des Bodens.

## Wo was liegt

- `inhalte.mjs` – alle Texte und die Zuordnung `produkttypen`. Werte wie
  Raumklima, Akklimatisierung, Ebenheit und 27 °C stammen aus den
  Ratgeber-Artikeln im Shop; was je Hersteller abweicht, steht als
  „laut Verpackung/Anleitung“ drin. Keine Marken- oder Lieferantennamen.
- `vorlage.css` – Druckvorlage; `vorlage.mjs` baut daraus das HTML, `pdf.mjs` das PDF.
- `logo.png` – Shop-Logo (`shop_images/logo.webp`, 500 px).
- `inter-400/500/700.woff` – Inter, SIL Open Font License 1.1, von Google Fonts.
  Nicht die Dateien aus dem Shopify-Font-CDN nehmen: denen fehlt die
  Namenstabelle, Chromium bettet sie dann als Type-3-Schrift ein (unscharf,
  dreifache Dateigröße).
- `qr/*.svg` – QR-Codes auf den passenden Online-Ratgeber (mit `qrencode`).
- `pdf/*.pdf` – die fertigen PDFs, so wie sie in Shopify liegen.

## Ändern und neu veröffentlichen

```
npm run -s ratgeber:pdf                  # alle neu drucken, meldet „ZU VOLL“ bei Überlauf
npm run -s ratgeber:pdf -- --nur parkett
npm run -s ratgeber:pdf -- --qr          # nach geändertem Online-Link
```

Danach die geänderte Datei in Shopify ersetzen (Inhalt → Dateien → Datei →
Ersetzen). Der Dateiname muss gleich bleiben: die Bestellbestätigung verlinkt
fest `https://www.teppich-paradies.net/cdn/shop/files/ratgeber-<schluessel>.pdf`.

Neuer Ratgeber oder neuer Produkttyp: in `inhalte.mjs` **und** in
`../benachrichtigungen/bestellbestaetigung-block.liquid` eintragen (Liquid in
Benachrichtigungen kann keine Dateien aus dem Repository lesen).
`qa/tests/kundenmail-bloecke.test.mjs` rendert jeden Produkttyp aus
`inhalte.mjs` gegen die Vorlage und schlägt fehl, wenn beide auseinanderlaufen.

## Ausdrucken und beilegen

Für die Ware, die durch unsere Hände geht (Abholung, eigene Lieferung, Ware im Laden),
gibt es dieselben Ratgeber als Druck je Bestellung: Kopf und „Für Ihre Unterlagen“ sind
ausgefüllt (Bestellnummer, Produkt und Farbe, beim Teppich Maß und Kaufdatum).

- **Control Center:** Kunden → Bestellungen, Zeile aufklappen → „Ratgeber drucken“
  (PDF im neuen Tab). Der Dialog „An Kunden raus“ erinnert daran, wenn die Ware bei uns
  liegt oder abgeholt wird.
- **Kommandozeile:** `npm run -s ratgeber:pdf -- --bestellung 1070 --oeffnen` schreibt
  `$TP_PRIVAT_DIR/ratgeber-druck/1070.pdf` und öffnet es in Vorschau.

Beidseitig drucken, dann liegt der Ratgeber auf einem Blatt. Kundendaten kommen nur aus
dem lokalen Bestellexport und landen nie im Repository. `vorlage.mjs` baut das HTML ohne
Browser, `pdf.mjs` macht daraus das PDF (Chromium).

## In Shopify

Hochgeladen am 2026-10-28 als Dateien (GenericFile), öffentlich abrufbar unter
`https://www.teppich-paradies.net/cdn/shop/files/ratgeber-*.pdf`.
