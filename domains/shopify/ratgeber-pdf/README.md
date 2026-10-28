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

Noch ohne Ratgeber (wenige Produkte): Kork, Linoleum, Kautschuk, Kunstrasen,
Sauberlauf, Dekofell sowie alles Zubehör.

## Wo was liegt

- `inhalte.mjs` – alle Texte und die Zuordnung `produkttypen`. Werte wie
  Raumklima, Akklimatisierung, Ebenheit und 27 °C stammen aus den
  Ratgeber-Artikeln im Shop; was je Hersteller abweicht, steht als
  „laut Verpackung/Anleitung“ drin. Keine Marken- oder Lieferantennamen.
- `vorlage.css` – Druckvorlage; `scripts/ratgeber-pdf.mjs` baut daraus das HTML.
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

## In Shopify

Hochgeladen am 2026-10-28 als Dateien (GenericFile), öffentlich abrufbar unter
`https://www.teppich-paradies.net/cdn/shop/files/ratgeber-*.pdf`.
