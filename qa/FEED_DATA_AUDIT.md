# Feed-Daten-Audit (Google Shopping / Merchant Center)

Stand: 2026-08-30. Erhoben über die Shopify Admin API (read-only), keine Produktdaten verändert.

## Ausgangslage

- 345 aktive Produkte
- 2.893 Varianten

## Befund 1: GTIN/EAN fehlt vollständig

**0 von 2.893 Varianten haben einen Barcode.** Geprüft an 150 Produkten aus drei
unabhängigen Stichproben (erste 100 nach ID, älteste 50 nach Erstelldatum) — kein
einziger Treffer, quer durch alle Produkttypen und alle Importgenerationen.

Das ist der Hauptgrund, warum `MERCHANT_READINESS_REPORT.md` kein einziges Produkt
als READY führt. GTINs lassen sich nicht ableiten oder erzeugen; sie müssen vom
Hersteller kommen.

**Eine fehlende GTIN ist für uns aber kein Blocker — siehe die Feed-Strategie unten.**

## Feed-Strategie: eigene Marke plus eigene MPN

Diese Entscheidung ersetzt die frühere Empfehlung, `identifier_exists: false` zu
setzen. Die war falsch. Google verlangt `identifier_exists: no` nur dort, wo
*weder* GTIN *noch* MPN *noch* Marke existieren — also bei Unikaten, Antiquitäten
oder Einzelanfertigungen. Wir haben eine Marke und wir haben Artikelnummern, also
trifft das auf uns nicht zu. `no` zu melden, obwohl eine Kennung existiert, führt
laut Google zur Ablehnung des Artikels.

Der richtige Weg für uns:

| Feld | Wert |
|---|---|
| `identifier_exists` | `yes` |
| `brand` | eigene Marke (TeppichParadies) |
| `mpn` | **eigene** Artikelnummer |
| `gtin` | leer, solange keine eigene GTIN existiert |

Damit ist der Feed regelkonform — keine Ablehnung wegen fehlender Kennung — und
gleichzeitig gruppiert Google unsere Artikel nicht mit denen anderer Händler. Eine
Zusammenführung entsteht nur, wenn zwei Händler dieselbe Kennung melden. Marke und
MPN sind bei diesem Vorgehen ausschließlich unsere.

**Fallstrick, der das Ganze aushebeln würde:** Unsere SKUs sind aus dem
Nummernschema des Lieferanten abgeleitet (`TEPLORN04_99`, `CVALL2_250`,
`CVEXPGR02_130`). Landet eine solche Nummer als `mpn` im Feed, matchen uns alle
anderen Händler, die beim selben Lieferanten kaufen — über MPN statt über GTIN,
aber mit demselben Ergebnis. `mpn` und interne SKU dürfen sich unterscheiden; für
den Feed brauchen wir ein eigenes MPN-Schema, falls die SKUs mit den
Lieferantennummern identisch sind. **Das ist vor der Feed-Konfiguration zu
prüfen.**

Ebenso gilt: die *echte* Herstellermarke gehört nicht in den Feed, solange wir
unter eigenem Namen verkaufen. Sonst greift die Zusammenführung über Marke plus
MPN.

Die Lieferantenanfrage bleibt trotzdem sinnvoll, nur mit verschobenem Zweck: Wir
müssen *wissen*, ob GTINs existieren, nicht sie zwingend verwenden.

Langfristige Option, falls die Eigenmarke tragen soll: eigene GTINs über GS1
beziehen. Dann sind wir offiziell Markeninhaber, der Feed ist vollständig, und die
Nummern zeigen weiterhin nur auf unsere Produkte.

## Befund 2: SKU fehlt bei genau drei Produkten

Alle ab dem 31.07.2026 angelegten Produkte haben durchgängig SKUs nach dem
Lieferantenschema (`TEPLORN04_99`, `CVALL2_250`). Ohne SKU sind ausschließlich die
drei handgepflegten Altprodukte:

| Produkt | Handle | Varianten ohne SKU |
|---|---|---|
| Saphir Teppichboden 400cm und 500cm | `saphir-teppichboden-400cm-und-500cm` | 14 |
| Rohan Teppichboden 400cm 500cm | `rohan-teppichboden-400cm` | 10 |
| Norway Teppichboden 400cm | `norway-teppichboden-400cm-und-500cm-kopie` | 6 |

Summe: 30 Varianten.

**Erledigt am 2026-08-30:** Alle drei Produkte wurden nach ausdrücklicher Freigabe
gelöscht, ihre URLs leiten dauerhaft auf `/collections/teppichboden` um. Damit ist
die SKU-Lücke geschlossen — jede verbleibende Variante im Katalog trägt eine SKU
nach Lieferantenschema. Nebeneffekt: Es gibt keine Produkte mit `tracked: true`
mehr, der Katalog folgt jetzt durchgängig einem Bestandsmodell (siehe Befund 3).

## Befund 3: Zwei unterschiedliche Bestandsmodelle

Kein Fehler, aber eine Inkonsistenz, die bei Feed-Prüfungen leicht als solcher
gelesen wird:

| Gruppe | tracked | inventoryPolicy | Menge | verkäuflich |
|---|---|---|---|---|
| Altbestand (Saphir, Rohan, Norway) — inzwischen gelöscht | true | CONTINUE | 999/Variante | ja |
| Alle Importe ab 07/2026 | false | DENY | 0 | ja |

Die Importe zeigen `inventoryQuantity: 0`, sind aber wegen `tracked: false`
uneingeschränkt verkäuflich. Wer nur auf die Bestandszahl schaut, hält den halben
Katalog für ausverkauft. Eine Vereinheitlichung ist optional; wichtig ist, dass
`availableForSale` überall `true` ist.

## Priorität

1. Prüfen, ob unsere SKUs mit den Artikelnummern des Lieferanten identisch sind.
   Falls ja, eigenes MPN-Schema für den Feed festlegen. Das ist die Voraussetzung
   dafür, dass die Eigenmarken-Strategie im Feed überhaupt trägt.
2. `vendor` vereinheitlichen (siehe Befund 4) — Google liest das Feld als `brand`.
3. Beim Lieferanten erfragen, ob überhaupt GTINs existieren; Antwort dokumentieren.
4. ~~SKU-Schema für die drei Altprodukte festlegen~~ — erledigt durch Löschung.
5. Bestandsmodell ist seit der Löschung einheitlich (`tracked: false`); keine Aktion nötig.

## Nachtrag 2026-08-30: Alt-Texte der Produktbilder

Alle 342 aktiven Produkte über die Admin API auf den Alt-Text ihres Hauptbildes
geprüft und **172 korrigiert**. Zwei Fehlerbilder:

**110 leere oder unbrauchbare Alt-Texte.** Betroffen war praktisch der komplette
Klebevinyl-Import — Alvora, Fenora, Kiruna, Dornova, Verdon, Selvana, Amara,
Solenta — dazu fünf Rollenvinyl-Produkte. Ein Bild trug den Platzhalter
`test-resample` und wurde so live ausgeliefert.

**62 veraltete Markennamen.** Die Alt-Texte trugen noch die Namen aus der Zeit
vor der Umbenennung, während die Produkte längst anders heißen:

| Alt-Text alt | Produktmarke heute |
|---|---|
| Livano | Landora |
| Verdano | Eichwald |
| Marano | Terracora |
| Traxano | Granitera |
| Corvano | Kontura |
| Alvano | Amara |
| Verano | Serena |
| Velano | Velluna |
| Solano | Practiva |

Das war nicht nur ein SEO-Problem: Google und Screenreader bekamen einen
Markennamen zu hören, den es im Shop nicht mehr gibt.

Gesetztes Muster, angelehnt an die bereits korrekten Einträge:
`<Marke> <Produktart> <Dekor bzw. Farbe>`, zum Beispiel
`Terracora Vinylboden Eiche Braun` oder `Kontura Teppichboden Grün Dunkel (405)`.

Geprüft wurden die Hauptbilder. Weitere Bilder je Produkt (Galerie, Detailfotos)
sind in dieser Runde nicht erfasst.

## Befund 4: `vendor` ist uneinheitlich gepflegt

Google liest das Shopify-Feld `vendor` als `brand`. Aktuell steht dort mal der
Shopname, mal der Name der Produktlinie:

| Produkte | vendor |
|---|---|
| Kontura, Amara, Serena Teppichboden | `TeppichParadies` |
| Landora Vinyl von der Rolle | `TeppichParadies` |
| Rovelia Klickvinyl | `TeppichParadies` |
| Bergen Klickvinyl | `Bergen` |
| Palermo Klebevinyl | `Palermo` |

Für die oben beschriebene Feed-Strategie muss die Marke eindeutig sein.
Empfehlung: durchgängig `TeppichParadies` als Marke, die Linie (Bergen, Palermo,
Terracora) bleibt im Produkttitel. Zwei parallele Markenwerte schwächen die
Eigenmarke und erschweren die Zuordnung im Merchant Center.

Das ist ein Shopify-Write an Produktdaten und braucht eine Freigabe.
