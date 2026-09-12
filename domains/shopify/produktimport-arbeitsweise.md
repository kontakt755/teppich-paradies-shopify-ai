# Produktimport — Arbeitsweise

Gelernt am 2026-09-07 beim Linoleum-Import (8 Produkte, 54 Varianten). Die Aufgabe hätte
in einer Sitzung erledigt sein können und brauchte drei. Was sie aufgehalten hat, steht hier.

Gilt für jeden Import aus einer Lieferantenquelle nach Shopify — Linoleum, Vinyl, Teppichboden.

---

## 1. Die Namensregeln vor dem ersten Produkt klären

**Der teuerste Fehler der Sitzung.** Sieben Produkte wurden mit Lieferantennamen angelegt
(`Linie A-3 Vivace Linoleumboden`) und mit englischen Farbnamen samt Nummer
(`1032 green melody`). Beides musste komplett zurückgebaut werden.

Dabei stand die Regel längst im Import-Skill: *"invent a brand name freely per product
line — NOT the supplier's own line name"*. Und die zwei fertigen Referenzprodukte im Shop
zeigten es vor: **Coloria** und **Elastium** tragen Eigennamen, Elastium hat deutsche
Farbnamen nach dem Schema `Grundton + Stufe`.

**Vor dem ersten `productSet` festhalten:**

| | Regel |
|---|---|
| Produkttitel | `{Eigenname} Linoleumboden 200cm` — Eigenname frei erfunden, nie die Lieferantenlinie |
| Vendor | derselbe Eigenname |
| Lieferantenlinie | gehört nach `grosshandel.sku`, nirgends sonst |
| Farbname | deutsch, `Grundton + Stufe`, ohne Nummer, ohne Englisch, pro Produkt eindeutig |
| Farbnummer | nur in SKU (`{PREFIX}_{NUMMER}`) und `custom.farbcode` |

**Ein bestehendes, fertiges Produkt ist die Spezifikation.** Vor dem Anlegen eines neuen
Produkts das nächstliegende fertige abfragen — Titel, Vendor, Variantentitel, Metafelder —
und daran entlangbauen. Das kostet eine Query und spart eine Sitzung.

---

## 2. Serverseitig gerenderte Lieferantenseiten mit `curl` lesen, nicht mit dem Browser

Lieferant A liefert vollständiges SSR-HTML. Die erste Runde lief trotzdem über den Browser:
pro Farbe `navigate` + `wait` + `javascript_tool`, dazu geratene Produkt-IDs, die auf der
Startseite landeten und `no-image` zurückgaben.

Ein `curl`-plus-Python-Script hat später **alle 55 Farben von 8 Produkten in einem Lauf**
geholt — Farbwähler-URLs, Bild-URLs, Artikelnummer und die komplette Attributtabelle.

Das SSR-HTML enthält **mehr als der Browser zeigt**: die `product-attribute-name`-Tabelle mit
Stärke, Breite, Brandverhalten, Nutzungsklasse, Raumeignung, Qualität, EAN. Im gerenderten DOM
ist sie eingeklappt und wird für nicht eingeloggte Besucher teilweise entfernt.

```python
ATTR = re.compile(r'product-attribute-name">(.*?)</div>\s*<div class="col-8 col-lg-9[^"]*">(.*?)</div>', re.S)
OPT  = re.compile(r'<option[^>]*value="(https://lieferant-a\.example/de-DE/product/\d+)"[^>]*>(.*?)</option>', re.S)
```

Der Browser bleibt richtig für alles, was clientseitig rendert (die Suche) und für visuelle
Kontrolle. Für Datenerhebung ist er der langsame Weg.

**Farbwähler-URLs nie raten.** Die IDs einer Linie sind nicht fortlaufend. Nur die Werte aus
dem `<option value="...">` verwenden.

---

## 3. Erhobene Rohdaten sofort in eine Datei schreiben

Bild-IDs und Farbdaten lebten im Chatverlauf. Nach der Kompaktierung waren sie weg und mussten
zweimal neu erhoben werden.

Erhebung und Verarbeitung trennen: ein Script schreibt `data.json`, ein zweites liest es. Dann
kostet ein Fehler in Schritt 2 keine neue Erhebung, und die Daten überleben Sitzungsgrenzen.
Ablage unter `domains/shopify/<import>-farbdaten/`.

---

## 4. Bei GraphQL das Schema fragen, nicht die Syntax raten

CLAUDE.md sagt es bereits — in dieser Sitzung wurde es trotzdem ignoriert, mit hohen Kosten:

| Mutation | Fehlversuche | Ursache |
|---|---:|---|
| `inventory*` | 4 | Namen und Feldnamen geraten (`availableDelta`, `quantities`, `inventoryQuantitiesBulkUpdate` — existiert nicht) |
| `productVariantAppendMedia` | 3 | braucht vorab erzeugte `mediaIds`, nicht `originalSource` |
| `productSet` | 2 | `options` statt `productOptions`, `value` statt `name`, `category` als Objekt statt ID |
| `publishablePublish` | 2 | `publicationIds` statt Liste von `{publicationId}` |

Jeder Fehlschlag warf eine Fehlermeldung von mehreren tausend Zeichen zurück. Ein einziger
`graphql_schema`-Aufruf hätte jede dieser Fragen vorab beantwortet.

**Mehrere Mutationen gehören in ein Dokument mit Aliassen, nicht in mehrere `mutation`-Blöcke.**
Drei Anläufe scheiterten an `Operation name is required when multiple operations are present`:

```graphql
mutation {
  a: productUpdate(input: {...}) { product { id } userErrors { message } }
  b: productUpdate(input: {...}) { product { id } userErrors { message } }
}
```

---

## 5. `productSet` nur für neue Produkte

Auf einem **bestehenden** Produkt bricht `productSet` mit `id:` ab, sobald Metafelder mitkommen,
die dort schon existieren (`grosshandel.sku`, `global.title_tag`):
`Key must be unique within this namespace on this resource`.

Der Abbruch ist tückisch, weil er die **alte Variantenstruktur stehen lässt**. So trug Linie A-3
nach einem vermeintlich erfolgreichen Lauf sechs Concrete-Varianten statt sechzehn eigener —
und das fiel erst Stunden später auf.

Für Korrekturen an bestehenden Produkten sind die schmalen Mutationen richtig:

| Was ändern | Mutation |
|---|---|
| Farb-/Optionsnamen | `productOptionUpdate` mit `optionValuesToUpdate`, `variantStrategy: LEAVE_AS_IS` |
| Titel, Vendor, Handle, SEO, Beschreibung | `productUpdate` |
| Metafelder | `metafieldsSet` |
| Bild hochladen | `productCreateMedia(productId:, media:[...])` — nimmt die Lieferanten-URL direkt, kein `input`-Wrapper, kein Staged Upload |
| Variantenbild zuordnen | `productVariantsBulkUpdate` mit `mediaId` |
| Falsches Medium entfernen | `productDeleteMedia` |

---

## 6. Nach jedem Schreibvorgang gegenprüfen

Zwei Fehler blieben lange unbemerkt, weil nach dem Schreiben nichts geprüft wurde:

- Linie A-3 hatte 6 statt 16 Varianten (abgebrochenes `productSet`)
- Linie A-3 und Concrete hatten ihre **Medien vertauscht** — Concrete trug die 16
  Linie A-3-Bilder. Deshalb war bei beiden `variant.image == null`, und die Suche nach der
  Ursache ging zuerst in die falsche Richtung ("Bilder fehlen" statt "Bilder falsch zugeordnet")

Nach jedem Schritt eine Query auf Variantenzahl, SKU, Optionswert und `variant.image`.
`userErrors: []` allein ist kein Beleg dafür, dass das Ergebnis stimmt.

---

## 7. Lieferantenattribute gegen die Realität prüfen

Lieferant A pflegt `Farbe` und `Farbintensität` — die Werte sind unzuverlässig. `fresco blue`
steht dort als „Schwarz", gemessen ist es `#708ca4`. Sechs Linie A-3-Farben tragen identisch
„Grau / Mittel" und wären als Optionswerte nicht unterscheidbar; Shopify lehnt Dubletten ab.

Verlässlich ist die **Messung am Produktbild**: Median-RGB des Bildzentrums → HLS →
Grundton + Helligkeitsstufe. Reproduzierbar, einheitlich über alle Produkte, und es
widerspricht der Regel gegen erfundene Produkteigenschaften nicht — die zielt auf Farb**codes**
und technische Daten, die weiterhin abgeschrieben werden.

Beim Klassifikator: Graustufen (`S < 0.10`) müssen **vor** allen Warmton-Regeln entschieden
werden, sonst wird jedes neutrale Grau zu „Taupe".

---

## 8. Bash-Befehle einzeln absetzen

Verkettete Befehle (`cd x && y | z`) werden als **ein** Permission-Muster geprüft. Ist ein Glied
nicht abgedeckt, kommt eine Anfrage — auch wenn der Nutzer denselben Befehl in leicht anderer
Form schon zehnmal erlaubt hat. `.claude/settings.local.json` speichert nämlich exakte Strings,
keine Muster.

Mehrzeilige Logik in eine Datei schreiben und mit einem einzelnen Aufruf starten
(`python3 script.py`), statt sie in eine Befehlskette zu pressen.
