# Elastium Linoleumboden — Stand 2026-09-04

## Kernbefund: 21 der 24 Farbcodes sind erfunden

Das Produkt `gid://shopify/Product/16045140771150` fuehrt 24 Farbvarianten.
Beim Lieferanten existieren davon **drei**.

| | Codes |
|---|---|
| Korrekt | 4276, 4289, 4296 |
| Erfunden (21) | 4290–4295, 4297–4311 |
| Fehlt im Shop (21) | 4153, 4200, 4215, 4217, 4218, 4222, 4223, 4226, 4229, 4232, 4236, 4240, 4245, 4252, 4253, 4254, 4255, 4259, 4270, 4272, 4273 |

Uebernommen wurden offenbar nur die ersten beiden echten Codes; ab 4290 wurde
lueckenlos hochgezaehlt. Die **Anzahl** stimmt deshalb (24 = 24), der Inhalt
nicht. Das Produkt steht mit diesen Daten seit 2026-09-04 20:19 UTC live in
drei Verkaufskanaelen (Bestand 0).

Echte Quelle: Artikel `PVCJOKANEO`, „Linoleum-Boden Jokaleum Neocare 2,5mm
Elastic/Linoleum Bahnen 200cm" auf jordanshop.de. Der Shopname „Elastium" ist
eine Eigenbezeichnung und taucht beim Lieferanten nicht auf — die Suche muss
ueber die Artikelnummer laufen, nicht ueber den Produktnamen.

### Naechster Schritt (braucht Freigabe)

SKU-Aenderungen sind laut CLAUDE.md eine Protected Action. Der fertige
Korrekturplan liegt bereit und aendert von sich aus nichts:

```
node scripts/elastium-farbcode-korrektur.mjs
```

Er druckt die Zuordnung (erfundener → echter Code) und die GraphQL-Variablen
fuer `productVariantsBulkUpdate`, `productCreateMedia` und
`productVariantAppendMedia`. Die Zuordnung ist aufsteigend und damit
willkuerlich — zulaessig, weil die erfundenen Codes keine Information tragen:
kein Bild, kein Bestand, keine Bestellung haengt daran.

## Was funktioniert und belegt ist

### Bild-Upload — die Kette laeuft

Zwei Aufrufe, **kein** `stagedUploadsCreate`. Shopify holt die fremde URL selbst:

```graphql
productCreateMedia(productId, media: [{ originalSource, alt, mediaContentType: IMAGE }])
productVariantAppendMedia(productId, variantMedia: [{ variantId, mediaIds }])
```

Nachweis: Farbe 4276 (`MediaImage/73532469477710`) und Farbe 4289
(`MediaImage/73532466626894`) haengen an ihren Varianten.

Die frueher notierte Ursache „Image upload blockiert (network policy)" war
falsch. Blockiert hat nichts — die Mutation hatte die falsche Signatur
(`variantId` + `media` statt `productId` + `variantMedia`).

### Metafelder

Alle 24 Varianten tragen `custom.color_code`. Bei 21 davon steht dort
allerdings ein erfundener Wert; sie werden mit der Korrektur ueberschrieben.

Der Input-Typ heisst `MetafieldsSetInput`, nicht `MetafieldInput`.

### Bild-URLs aus der Jordan-Suche

21 der 24 echten Farben haben ein Bild: `data/jokaleum-neocare-images.json`.
Ohne Bild beim Lieferanten und damit offener Fall: **4153, 4259, 4296**.

Drei Fallen, die je Zeit gekostet haben:

1. Die Suche liegt unter `/de-DE/search`. Ohne Sprachpraefix leitet der Shop
   wortlos auf die Startseite um — man durchsucht dann die Startseite.
2. Die Bilddateien tragen interne Artikel-IDs (`1127838-8FXC-prod.JPG` fuer
   Farbe 4289), nicht den Farbcode. Aus dem Farbcode gebaute URLs ergeben
   durchgaengig 404. Der Farbcode steht ausschliesslich im `alt`-Text.
3. Ausgeliefert wird ueber `images.intellishop.cloud`; die Original-URL steckt
   base64-kodiert im letzten Pfadsegment.

Ausserdem: Die Trefferbilder stehen nicht im ausgelieferten HTML. `curl`
bekommt HTTP 200 und 175 KB, darin aber nur drei `<img>`-Tags — den Rest
haengt clientseitiges JavaScript ein. Das Einsammeln braucht einen Browser:

```
node scripts/jordan-media-scrape.mjs snippet PVCJOKANEO
```

## Werkzeuge

| Datei | Zweck |
|---|---|
| `scripts/jordan-media-scrape.mjs` | Browser-Snippet erzeugen, Upload-Plan aus dem Katalog bauen |
| `scripts/elastium-farbcode-korrektur.mjs` | Korrekturplan drucken (aendert nichts) |
| `data/jokaleum-neocare-images.json` | 24 echte Farbcodes, 21 mit Original-Bild-URL |
