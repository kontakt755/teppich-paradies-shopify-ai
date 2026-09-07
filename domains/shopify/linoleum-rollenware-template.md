# Linoleum/Rollenware-Import — feste Vorlage
**Referenz:** Coloria Linoleumboden 200cm (Product ID: 16049177723214) — 9 Varianten,
Quelle jordanshop.de/de-DE/product/409753, Farbcodes und Bild-IDs einzeln abgeschrieben.

> Elastium Linoleumboden (16045140771150) ist **keine** Referenz fuer Farbdaten: dort waren
> laut `CLAUDE.md` 21 von 24 Farbcodes hochgezaehlt statt abgeschrieben.

Gilt für: Linoleum, Vinylboden von der Rolle, elastische Bodenbeläge — NICHT für Teppichboden (eigene jordanshop-Skill).

---

## 0. Die eine Regel, an der alles hängt: `productSet`

**Optionen und Varianten werden in EINEM Aufruf mit dem Produkt angelegt — niemals nachtraeglich.**
Die Mutation dafuer heisst `productSet`. Sie nimmt `productOptions`, `variants`, `files`,
`metafields`, `category`, `collections` und `seo` zusammen entgegen und ersetzt beim Setzen
mit `id:` die komplette Struktur eines bestehenden Produkts.

```graphql
mutation { productSet(synchronous: true, input: {
  id: "gid://shopify/Product/<id>"        # weglassen = neues Produkt
  productOptions: [
    {name: "Farbe",  position: 1, values: [{name: "Farbe 4381"}, ...]}
    {name: "Breite", position: 2, values: [{name: "200cm"}]}
  ]
  files: [{originalSource: "https://media.jordanshop.de/original/<id>-8FXC-prod.JPG",
           contentType: IMAGE, alt: "..."}, ...]
  variants: [{
    optionValues: [{optionName: "Farbe", name: "Farbe 4381"},
                   {optionName: "Breite", name: "200cm"}]
    price: "42.95", sku: "PVCJOKANEC_4381"
    inventoryPolicy: CONTINUE          # PFLICHT bei Rollenware, siehe unten
    file: {originalSource: "...", contentType: IMAGE, alt: "..."}
    metafields: [{namespace: "custom", key: "farbcode", value: "4381",
                  type: "single_line_text_field"}]
  }, ...]
}) { product { id } userErrors { field message code } } }
```

**`inventoryPolicy: CONTINUE` nicht vergessen.** Ohne diese Angabe legt Shopify die Variante mit
`DENY` an. Rollenware wird auf Bestellung geschnitten und hat nie Lagerbestand, also steht jede
Variante dann auf `availableForSale: false` — der Konfigurator meldet auf der Produktseite
„Diese Breite ist derzeit nicht lieferbar" und das Produkt ist live, aber unverkaeuflich.
Genau so passiert am 2026-09-07 bei Coloria.

Jede Datei unter `variants[].file` muss auch in `files` des Produkts stehen. Ein bereits
hochgeladenes Bild wird an beiden Stellen als `{id: "gid://shopify/MediaImage/<id>"}` referenziert.

**Was NICHT funktioniert** (kostet sonst eine Sitzung):

| Versuch | Ergebnis |
|---|---|
| `productCreate` + Varianten danach | `productCreate` nimmt keine Varianten entgegen |
| `productVariantCreate` / `productVariantUpdate` / `productVariantsUpdate` | existieren nicht |
| `productVariantsBulkUpdate` mit `title:` | `ProductVariantsBulkInput doesn't accept argument 'title'` |
| Farbdaten als JSON in ein Metafeld schreiben | Notloesung ohne kaufbare Variante — nie tun |

`productVariantsBulkUpdate` bleibt nur fuer Preis und SKU **bestehender** Varianten zustaendig.
Ist eine Variantenstruktur falsch, wird sie mit `productSet` auf derselben Produkt-ID
ueberschrieben — das Produkt dafuer zu loeschen ist nicht noetig.

---

## 1. Optionen & Varianten-Titel

**Optionen (immer zwei, auch bei nur einer Breite):**
- Option 1: `Farbe` (Werte: echte deutsche Farbnamen, z.B. "Gelb Beige", "Braun Dunkel", "Blau Grau Hell")
- Option 2: `Breite` (Wert: z.B. "200cm" — bei 200cm nur dieser eine Wert)

**Varianten-Titel-Format:**
`{Farbe} / {Breite}` 
Beispiel: `"Gelb Beige / 200cm"`

**Farbnummern (nur Backend, für Kunden unsichtbar):**
- Farbnummer wird in **custom.farbcode** (Metafeld, single_line_text_field) gespeichert
- Im Frontend nicht angezeigt; Kunde sieht nur den Farbnamen
- SKU folgt Muster: `{SUPPLIER_SKU}_{FARBCODE}` (z.B. `PVCJOKANEO_4276`)

---

## 2. Farbnamen & Bildquellen

**Quelle für Farbnamen:**
- jordanshop.de zeigt bei diesen Linien nur Codes ("Farbe 4381")
- Existiert im Quelltext ein echtes Feld `Farbe: {Name}` / `Farbintensitaet`, wird dieser Name uebernommen
- Existiert es nicht, gilt fuer die **ganze** Linie der Fallback `Farbe {code}` — nie mischen
- **Farbnamen werden NIE aus dem Produktbild abgeleitet.** `AGENTS.md`: „Nie technische
  Eigenschaften erfinden oder anhand eines Produktbildes allein ableiten." Ein aus einem Foto
  geratener Name ist eine erfundene Produkteigenschaft, auch wenn er plausibel klingt.
- Fehlende Farbnamen sind ein offener Fall, den man dem Nutzer meldet — kein Grund, etwas zu erfinden

**Farbcodes und Bild-IDs abschreiben, nie fortzaehlen.**
Die Bild-IDs einer Linie sind **nicht** fortlaufend. Real gemessen bei Jokaleum Color Neocare:

| Farbe | 4381 | 4380 | 4371 A | 4359 | 4358 | 4352 A |
|---|---|---|---|---|---|---|
| Bild-ID | 1127820 | 1127822 | 1127824 | 1127826 | **1160112** | 1127830 |

Wer ab 1127820 hochzaehlt, liegt ab der zweiten Farbe falsch und bei 4358 um 32.000 daneben.
`npm run farbcode:guard` findet das Zaehlmuster bei Farbcodes.

**Bilder — echte URL je Farbe holen:**
1. Farbwaehler der Gruppenseite auslesen → Produkt-ID je Farbe:
   ```js
   Array.from(document.querySelectorAll('select')).map(s => ({
     name: s.closest('article,section')?.innerText.slice(0,80),
     options: Array.from(s.options).map(o => ({text:o.textContent.trim(), value:o.value}))
   }))
   ```
   Mehrere `select` auf einer Seite gehoeren zu **verschiedenen Artikeln** (unterschiedliche
   Artikelnummer) — nur den mit der passenden Artikelnummer verwenden.
2. Auf jeder Farb-Detailseite die Bild-URL dekodieren:
   ```js
   const r = document.querySelector('main img').getAttribute('src');
   atob(r.split('/').pop().split('.')[0].replace(/-/g,'+').replace(/_/g,'/'))
   // -> https://media.jordanshop.de/original/1127820-8FXC-prod.JPG
   ```
3. Liefert `atob` Unsinn oder steht in der URL `default-image/gallery_preview`, hat diese Farbe
   **kein echtes Foto**. Die Variante wird dann komplett weggelassen und die Auslassung gemeldet.
4. Alt-Text-Muster: `"{Marke} Linoleumboden Farbe {Farbcode}"`
5. Zuordnung Bild→Variante passiert in `productSet` ueber `variants[].file`, nicht nachtraeglich

---

## 3. Kategorie (Taxonomy)

**Immer setzen:**
- Taxonomy-Category: `gid://shopify/TaxonomyCategory/ha-2-5` 
- Anzeige: **"Fußböden & Teppichböden in Baumaterialien"**

(Abweichung von Teppichboden, das auch diese Kategorie nutzt.)

---

## 4. Metafelder (Rollenware-Set)

Referenz-Stand: Coloria (16049177723214), 2026-09-07 vollstaendig befuellt und live gegengeprueft.
Elastium (16045140771150) ist fuer diesen Abschnitt **veraltet** — es hat nur die ersten 6 Zeilen
der folgenden Tabelle, die Kategorie-Metafelder fehlen dort komplett.

**Produkt-Metafelder (im `productSet`-Aufruf mitgeben, `namespace`/`key`/`value`/`type`):**

| Namespace | Key | Typ | Beispiel | Quelle |
|-----------|-----|-----|----------|--------|
| `custom` | `starke` | single_line_text_field | `2.5 mm` | jordanshop „Stärke (mm)" |
| `custom` | `ruckenausstattung` | single_line_text_field | `Elastischer Träger` | jordanshop-Produktaufbau |
| `custom` | `material` | single_line_text_field | `Linoleum elastisch` | fest fuer alle Linoleum-Linien |
| `custom` | `rollenbreite` | number_decimal | `2` | jordanshop „Breite (mm)" / 1000, z.B. 2000mm → `2` |
| `custom` | `brandverhalten` | list.metaobject_reference | `["gid://shopify/Metaobject/1723461796174"]` | Cfl-S 1, siehe Tabelle unten |
| `grosshandel` | `sku` | single_line_text_field | `Jokaleum Color Neocare` | jordanshop „Qualität" |
| `global` | `title_tag` | single_line_text_field | `{Marke} Linoleumboden {Breite} \| TeppichParadies` | generiert |
| `global` | `description_tag` | single_line_text_field | `{Marke} Linoleumboden in {N} Farben, {Breite} Breite. ...` | generiert |
| `mm-google-shopping` | `google_product_category` | string | `2826` | fest — Google-Kategorie „Bodenbeläge", quer ueber alle Rollenware wiederverwendbar |

Je Variante zusaetzlich `custom.farbcode` (single_line_text_field, der reine Zahlencode).

**`custom.brandverhalten` — vorhandene Metaobject-Werte** (Definition `37467554126`,
`metaobjects(type: ...)` liefert keine Treffer ueber den Typnamen, nur ueber
`metaobjectDefinition(id:).metaobjects`):

| Wert auf jordanshop.de | Metaobject-ID |
|---|---|
| Cfl-s1 | `gid://shopify/Metaobject/1723461796174` |
| Bfl-s1 | `gid://shopify/Metaobject/1781884682574` |

Steht auf jordanshop.de ein anderer Code, erst pruefen ob ein passendes Metaobject existiert
(`metaobjectDefinition(id: "gid://shopify/MetaobjectDefinition/37467554126") { metaobjects(first: 20) { nodes { id fields { key value } } } }`),
sonst als offenen Fall melden statt zu raten.

**`custom.nutzungsklassen`** (Definition `36984750414`) deckt nur Klasse 21–33 und 42 ab.
Jokaleum-Linien liefern haeufig Codes wie „43" oder „34" (EN ISO 10874: erste Ziffer =
Bereich, zweite = Belastung), fuer die **kein Metaobject existiert**. Nicht raten, welchen
deutschen Beschreibungstext ein neuer Eintrag „Klasse 43" bekommen soll — als offenen Fall
melden, Feld leer lassen.

**Kategorie-Metafelder (`shopify`-Namespace, an die Taxonomy-Category `ha-2-5` gebunden):**

| Namespace.Key | Wert | Bedingung |
|---|---|---|
| `shopify.suitable-space` | `["gid://shopify/Metaobject/180115210574"]` (Drinnen) | immer, Linoleum ist Innenbelag |
| `shopify.suitable-location` | `["gid://shopify/Metaobject/197202510158","gid://shopify/Metaobject/197202542926","gid://shopify/Metaobject/197202673998","gid://shopify/Metaobject/205372358990"]` (Wohnzimmer, Schlafzimmer, Flur, Gewerbe) | immer, deckt sich mit den Raum-Tags |
| `shopify.color-pattern` | pro Farbe das naechste Metaobject | **nur** wenn fuer die ganze Linie echte Farbnamen bekannt sind — bei Codes weglassen |
| `shopify.material` | — | **immer weglassen.** Shopify-Taxonomie kennt kein Material „Linoleum", naechster Wert waere „Vinyl" (PVC) — chemisch falsch, nicht mappen |
| `shopify.pile-type`, `shopify.allergy-friendly-features` | — | Teppichboden-spezifisch (Flor, Staubbindung), fuer glatten Linoleumbelag nicht zutreffend |

**Fußbodenheizung — Entscheidung 2026-09-07:** Das `pd-card`-Template behauptet in Satz und
Badge „funktioniert mit Fußbodenheizung". jordanshop.de erwaehnt das bei keiner Farbe. Der
Nutzer hat entschieden, die Aussage trotzdem stehen zu lassen — echtes Leinoel-Linoleum gilt
in der Baubranche allgemein als fussbodenheizungsgeeignet (gute Waermeleitfaehigkeit), das
ist als Materialklassen-Wissen akzeptiert, nicht als Produktdatenbeleg verlangt. Es gibt aber
kein `custom.fusbodenheizung`-Metafeld dafuer — die Kategorie-Metaobjekte in Shopifys eigener
Definition (`MetaobjectDefinition/37467521358`) sind nicht sauber bequellbar, deshalb bleibt
dieses Feld leer; die Aussage lebt nur in Beschreibung/SEO-Text.

---

## 5. Template & Theme

**Template Suffix:** immer `"rolle"`

**Theme-Vorlage beim Anlegen:**
- Im Shopify Customizer: **"rolle"** auswählen (für Rollenware-spezifisches Layout)

---

## 6. Tags

```
art: linoleumboden
breite_boden: 200cm          (oder 400cm, 500cm — ein Tag pro Breite)
eignung: pflegeleicht
eignung: rutschhemmend
material: linoleum           (oder vinyl, je nach Produkt)
objekt: büro
objekt: gewerbe
raum: flur
raum: schlafzimmer
raum: wohnzimmer
```

---

## 7. Description HTML

**pd-card Template für Rollenware:**

```html
<div class="pd-card">
  <h3>{Markenname} Linoleumboden</h3>
  <p>{Markenname} ist ein elastischer Linoleumboden mit hoher Strapazierfähigkeit und einfacher Reinigung. Ideal für Wohnräume und gewerbliche Nutzung durch Rutschhemmung und Dauerhaftigkeit. {Markenname} funktioniert mit Fußbodenheizung (Warmwasser und Elektro) und ist in {N} Farben sowie {Breite} erhältlich.</p>
  <div class="pd-badges">
    <span class="pd-badge">{Stärke} mm Stärke</span>
    <span class="pd-badge">Elastisch & rutschhemmend</span>
    <span class="pd-badge">Fußbodenheizung geeignet</span>
    <span class="pd-badge">Nutzungsklasse {Klasse}</span>
  </div>
  <table class="pd-specs">
    <tr><th>Eignung</th><td>Wohnräume & Gewerbe</td></tr>
    <tr><th>Material</th><td>Linoleum elastisch</td></tr>
    <tr><th>Stärke</th><td>{Stärke} mm</td></tr>
    <tr><th>Verfügbare Breiten</th><td>{Breiten}</td></tr>
    <tr><th>Brandverhalten</th><td>Cfl-s1</td></tr>
  </table>
</div>
```

---

## 8. Vollständigkeit & Updates

- Farblisten auf jordanshop.de können nachträglich wachsen (neue Produkt-IDs im gleichen Farbwähler)
- Bei Re-Importen prüfen: Sind neue Farben seit letztem Import dazugekommen?
- SKU-Pattern (Supplier-Nummer + Farbcode) befolgen, wie auf jordanshop.de angezeigt

---

## Checkliste beim Anlegen

**Zuerst sammeln, dann in EINEM `productSet` anlegen.** Reihenfolge ist Teil der Regel:
ein Produkt ohne Varianten entsteht gar nicht erst.

Sammeln (jordanshop.de):
- [ ] Preis live von der Produktseite ablesen (`XX,XX € / m²`) — nie aus dem Gedaechtnis
- [ ] Artikelnummer-Prefix von der Seite (z.B. `PVCJOKANEC`)
- [ ] Farbcode-Liste aus dem richtigen Farbwaehler — abgeschrieben, nicht gezaehlt
- [ ] Bild-URL je Farbe einzeln dekodiert; Platzhalter-Farben streichen
- [ ] Technische Daten von der Seite: Staerke (mm), Ruecken/Produktaufbau, Breite (mm),
      Brandverhalten, Nutzungsklasse — je als eigener `t.match()`/`grab()`, nicht aus der
      Beschreibung eines anderen Produkts uebernehmen

Anlegen (ein `productSet`):
- [ ] Titel: `{Marke} Linoleumboden {Breite}`
- [ ] 2 Optionen: Farbe + Breite
- [ ] Varianten vollstaendig: Farbe sichtbar, `custom.farbcode` intern, SKU, Preis, eigenes Bild
- [ ] `inventoryPolicy: CONTINUE` bei jeder Variante — sonst live und unverkaeuflich
- [ ] Produkt-Metafelder (Abschnitt 4, Tabelle 1): starke, ruckenausstattung, material,
      rollenbreite, brandverhalten, grosshandel.sku, title_tag, description_tag, google_product_category
- [ ] Kategorie-Metafelder (Abschnitt 4, Tabelle 3): shopify.suitable-space, shopify.suitable-location
- [ ] Kategorie: `ha-2-5` — danach pruefen, dass nicht `TaxonomyCategory/na` dasteht
- [ ] Template: "rolle"
- [ ] Tags: art, breite_boden, eignung, material, objekt, raum
- [ ] Collection "Linoleumboden"
- [ ] Status: ACTIVE

Danach:
- [ ] `publishablePublish` auf **beide** Kanaele: Onlineshop `239013396814`, Shop `239013462350`
      (`status: ACTIVE` allein veroeffentlicht nichts — `resourcePublicationsCount` gegenpruefen)
- [ ] Verifikations-Query: Variantenzahl, SKU, Bild und `custom.farbcode` je Variante
- [ ] Storefront gegenpruefen: `/products/<handle>.js` muss `variants.length` und ebenso viele
      `available: true` liefern. Die Storefront cacht — mit `?cb=<timestamp>` und
      `{cache:'reload'}` nachladen, bevor man einen Fehler vermutet
- [ ] Kein Duplikat entstanden? Handle mit `-1`-Suffix ist das Warnzeichen:
      `products(query: "handle:<marke>*")` pruefen
- [ ] Ausgelassene Farben und fehlende Farbnamen dem Nutzer melden
