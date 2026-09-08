# Linoleum-Produkte — erledigt am 2026-09-07

Alle acht Linoleum-Produkte tragen jetzt Eigennamen und einheitliche deutsche
Farbnamen. Die drei ursprünglichen Anforderungen sind umgesetzt:

1. **Eigennamen** — kein `Jokalino` / `Jokaleum` / `LINOFLEX` mehr in Titel,
   Vendor, Beschreibung, SEO oder URL
2. **Einheitliche deutsche Farbnamen** — Grundton + Helligkeitsstufe, aus den
   Messwerten abgeleitet, kein Englisch
3. **Keine Nummern im Farbnamen** — die Nummer steht in SKU und
   `custom.farbcode`; über beide ist eine Bestellung eindeutig zuzuordnen

## Stand in Shopify

| Titel | Vendor | Product-ID | Farben | €/m² | Lieferantenlinie (in `grosshandel.sku`) |
|---|---|---|---:|---:|---|
| Marenta Linoleumboden 200cm | Marenta | 16049244864846 | 16 | 39,95 | Jokalino |
| Nordan Linoleumboden 200cm | Nordan | 16049246077262 | 5 | 43,95 | LINOFLEX |
| Cavero Linoleumboden 200cm | Cavero | 16049267441998 | 6 | 49,95 | Jokalino Concrete |
| Fiora Linoleumboden 200cm | Fiora | 16049285759310 | 4 | 55,95 | Jokalino Vivace |
| Kaneo Linoleumboden 200cm | Kaneo | 16049295065422 | 6 | 51,95 | Jokalino Cocoa |
| Loftis Linoleumboden 200cm | Loftis | 16049307386190 | 4 | 60,95 | Jokaleum Urban |
| Selene Linoleumboden 200cm | Selene | 16049315643726 | 4 | 60,95 | Jokaleum Moon |
| Coloria Linoleumboden 200cm | Coloria | 16049177723214 | 9 | 42,95 | Jokaleum Neocare |

Coloria und Elastium behalten ihre Eigennamen. Coloria wurde mitgenommen, weil
seine Farbnamen noch `Farbe 4381` hießen — genau der Mangel, der weg sollte.

Handles wurden auf den Eigennamen umgestellt (`redirectNewHandle: true`, alte
Links leiten weiter).

## Farbnamen-Vokabular

Zweiteilig: **Grundton + Stufe**, wie bei Elastium.

- Grundtöne: Creme · Sand · Beige · Ocker · Taupe · Braun · Gelb · Oliv · Grün · Blau · Grau
- Stufen/Qualifizierer: Hell · Mittel · Dunkel · Warm · Gold · Silber · Anthrazit ·
  Oliv · Grün · Braun · Blau · Grau · Rot · Meliert

Innerhalb eines Produkts sind alle Werte eindeutig — Shopify lehnt Dubletten ab.
Bei Gleichstand trennt eine dritte Stufe (`Grau Hell` / `Grau Warm` /
`Grau Mittel` / `Grau Dunkel` / `Grau Oliv` / `Grau Braun` / `Grau Anthrazit`
bei Marenta, wo sieben Grautöne nebeneinander liegen).

**Wenn der Farbwert nicht mehr trennt, trennt die Oberfläche.** Marenta `1413`
und `1007` messen identisch (`#d9c8ad` / `#d8c7ad`), sehen aber verschieden aus:
`1413` ist nahezu uniform (Streuung 4–6), `1007` kräftig meliert (Streuung
11–14, graue und rostfarbene Adern). Deshalb `Sand Hell` und `Sand Hell Meliert`
— kein erfundener Helligkeitsunterschied, sondern das, was der Kunde auf dem
Bild sieht. Der Median allein sieht das nicht; erst die Standardabweichung
über dem Bildkern macht es sichtbar.

## Was am Klassifikator gefixt wurde (`colors.py`)

- **Graustufen entscheiden zuerst.** Die Warmton-Sonderregel überschrieb sie
  vorher: `1022 slate grey` (`#7c7774`, S=0.03) wurde zu „Taupe". Ebenso
  betroffen: `1015`, `604`, `4065`, `4070`.
- **Der Hue-Bereich 40–52° hieß „Orange".** Das ist Gelb/Creme-Gebiet.
  `1084` (`#e5e0c2`, L=0.83) ist Creme, `4133` (`#e2ce9b`, L=0.75) ist Sand.
- **Neue Stufe für sehr helle Töne** (L ≥ 0.80 → Creme).
- **Kräftig gesättigte Warmtöne sind Ocker, nicht Beige** — `4371 A` mit S=0.77
  landete sonst bei „Beige".
- **Kräftig gesättigte Gelbgrüntöne bleiben Gelb** — `1018 chartreuse` (S=0.45)
  wurde sonst „Oliv".

`4312` (Coloria) liefert `#ffffff` — Platzhalterbild, keine echte Farbe. Die
Variante existiert in Shopify nicht und bleibt weg.

## Variantenbilder — die eigentliche Ursache

Jokalino und Concrete hatten ihre Medien **vertauscht**: Concrete trug die 16
Jokalino-Bilder, Jokalino die 6 Concrete-Bilder. Deshalb war bei beiden
`variant.image == null`. `1209405` (Marenta „Grau Dunkel") fehlte in Shopify
komplett.

Behoben: 21 Bilder frisch von `media.jordanshop.de` hochgeladen
(`productCreateMedia` nimmt die jordanshop-URL direkt an — kein base64 nötig),
per `productVariantsBulkUpdate` mit `mediaId` zugeordnet, die falsch
zugeordneten Altmedien mit `productDeleteMedia` entfernt.

Alle 54 Varianten haben jetzt ein eigenes Bild.

## Warum nicht `productSet`

`productSet` mit `id:` bricht ab, sobald Metafelder mitkommen, die auf dem
Produkt schon existieren (`grosshandel.sku`, `global.title_tag`) — und lässt
dann die **alte Variantenstruktur stehen**. Genau so entstanden bei Jokalino
die 6 übrig gebliebenen Concrete-Varianten.

Gebraucht wurde davon nichts: SKU, `custom.farbcode` und `inventoryPolicy:
CONTINUE` waren bereits korrekt. Geändert werden mussten nur Optionswerte,
Titel/Vendor/SEO und die Bildzuordnung. Dafür sind die schmalen Mutationen
richtig und risikofrei:

| Was | Mutation |
|---|---|
| Farbnamen | `productOptionUpdate` mit `optionValuesToUpdate`, `variantStrategy: LEAVE_AS_IS` |
| Titel, Vendor, Handle, SEO, Beschreibung | `productUpdate` |
| `global.title_tag`, `global.description_tag` | `metafieldsSet` |
| Bilder hochladen | `productCreateMedia` |
| Variantenbild setzen | `productVariantsBulkUpdate` mit `mediaId` |
| Falsche Altmedien | `productDeleteMedia` |

Nach jedem Schritt wurde die Variantenzahl gegengeprüft — sie blieb überall gleich.

## Dateien in diesem Ordner

| Datei | Zweck |
|---|---|
| `messwerte.json` | 55 gemessene Farben (RGB/HEX/HLS/Grundton), Quelle für alles Weitere |
| `colors.py` | Bild → dominante Farbe → Grundton; `classify()` und `stufe()` sind importierbar |
| `reklassifizieren.py` | klassifiziert `messwerte.json` neu, ohne Pillow und ohne Netz |
| `namensplan.py` | Eigennamen und die Zuordnung Farbnummer → deutscher Name |
| `optionvalues.json` | Shopify-IDs der Optionswerte |
| `baue_mutationen.py` → `mutationen.json` | Umbenennungs-Payloads, bricht bei jeder Lücke ab |
| `baue_produktdaten.py` → `produktdaten.json` | Titel, Vendor, Handle, SEO, Beschreibung |
| `shopify_media.json` | Bilddatei → Shopify-MediaImage-ID |
| `baue_bildzuordnung.py` → `bildzuordnung.json` | Variante → Variantenbild |
| `fetch.py` | jordanshop → Rohdaten (nur zum Neuerheben nötig) |

`colors.py` braucht Pillow; systemweites pip ist auf diesem Mac gesperrt (PEP 668):
`python3 -m venv venv && ./venv/bin/pip install Pillow`

## Offen

- **Inventory-Tracking.** Die sieben Produkte zeigen weiter „Inventar nicht
  nachverfolgt" statt „0 auf Lager für X Varianten". Dafür müsste
  `inventoryItem.tracked = true` gesetzt und der Bestand an Location
  `gid://shopify/Location/98426814798` auf 0 gestellt werden. Kosmetisch,
  nicht verkaufsrelevant — war nicht Teil des Auftrags.
- **Elastium.** `npm run farbcode:guard` meldet dort weiterhin 23 lückenlose
  Codes 4289–4311 — der bekannte Verdacht auf durchgezählte statt
  abgeschriebene Farbcodes. Nicht angefasst, gehört gegen die Lieferantenliste
  geprüft.
