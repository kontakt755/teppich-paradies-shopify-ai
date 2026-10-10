# Teppich nach Maß: Raummaß und Einfassprodukte

Stand 2026-09-11. Code im Branch `feature/masstepich-konfigurator`. Die Produktdaten sind **noch nicht**
angelegt, das braucht eine ausdrückliche Freigabe (siehe unten). Ohne diese Daten rendern alle neuen Teile
nichts, der Shop bleibt also unverändert.

## Was der Kunde bekommt

| Wo | Was |
|---|---|
| Rollenware-Seite (`tp-rollware-rechner`) | Breite als Auswahl: feste Rollenbreiten oder „Wunschmaß – eigene Breite“ (Raummaß). Gezeigt wird nur der Raummaß-Preis je m², nicht seine Herleitung. Dazu eine Rollengrafik mit Schnittkante und Rest. |
| ebenda | Optional Kettelleisten (Höhe, Meter, Vorschlag = Umfang) und Haftunterlage (Rollen nach Fläche). Sie gehen im selben Warenkorb-Aufruf mit, verbunden über `_Gruppe`. |
| ebenda | Chips „Lieber als fertigen Teppich nach Maß?“ zu den Einfassprodukten, mit derselben Farbe vorgewählt. |
| Einfassprodukt (`templates/product.einfassung.json`) | Konfigurator: Form (Rechteck, rund, oval, nach Schablone, nach Skizze), Maße, Bandfarbe, Vorschau mit echter Teppichstruktur, Rechnung mit Fläche, Kante in lfm und Mindestpreis. Schablone und Skizze laufen als Anfrage (Kontaktformular und Foto per WhatsApp), nicht über den Warenkorb. |
| ebenda (`tp-einfass-wechsel`) | Wechsel zwischen den vier Einfassarten und zurück zur Meterware, die Farbe bleibt erhalten. |

## Eine Wahrheit, fail closed

Die Storefront liest **nur** öffentliche `service.*`-Metafelder. Freigegeben ist ausschließlich der exakte
Wert `Verfügbar`. Alles andere blendet das Angebot vollständig aus: kein Feld, ein anderer Wert, ein Tippfehler,
ein neues Produkt. Es gibt dann keinen deaktivierten Knopf und keinen Hinweis „auf Anfrage“.

| Metafeld | Ebene | Bedeutung |
|---|---|---|
| `service.einfassen` | Variante | Diese Farbe darf eingefasst werden. Schaltet Chips, Kettelleisten, Haftunterlage und die Varianten des Einfassprodukts frei. |
| `service.raummass` | Variante „Wunschmaß“ | Diese Raummaß-Variante ist freigegeben. |
| `service.einfassung` | Einfassprodukt | `Cover`, `Ketteln`, `Einfassband` oder `Paspelband` |
| `service.max_breite_cm` / `service.max_laenge_cm` | Einfassprodukt | Grenzen. Beim Cover gilt Rollenbreite − 10 cm (die Kante wird umgeschlagen); die Länge beträgt höchstens 1000 cm. |
| `service.formen` | Einfassprodukt | Liste aus Rechteck, Rund, Oval, Schablone, Skizze. Ohne Angabe gibt es nur Rechteck. |
| `service.mindestpreis` | Einfassprodukt | EUR, optional |
| `service.kante_inklusive` | Einfassprodukt | Boolean, optional, nur bei `Ketteln`. `true`: der m²-Preis enthält die Kettelung bereits (Hersteller-UVP je m²) – siehe „Kante im m²-Preis enthalten“. Fehlt das Feld oder ist es `false`, wird die Kante wie bisher über den Kettelservice berechnet. |
| `service.bandfarbe_fest` | Einfassprodukt | Text, optional, nur bei `Einfassband`/`Paspelband` – siehe „Feste Bandfarbe“. |
| `service.einfass_label` | Einfassprodukt | Text, optional: Beschriftung seines Chips im Einfass-Wechsel statt Cover/Gekettelt/Einfassband/Paspelband. |
| `service.einfass_gruppe` | Meterware und Einfassprodukte | die vier Einfassprodukte |
| `service.einfass_basis` | Einfassprodukt | die Meterware, aus der zugeschnitten wird |
| `service.basisvariante` | Variante des Einfassprodukts | die Meterware-Variante derselben Farbe. Die Farbe wird nie über Namen zugeordnet. |

Lieferantenbezug steht nie in `service.*` und nie im Theme. `npm run masstepich:guard` prüft das gegen eine
Namensliste, die nur intern liegt: in der Konfiguration außerhalb des Repositorys oder in `TP_LIEFERANTEN_NAMEN`.
Auch Hashes wären hier keine Lösung, denn kurze Namen lassen sich per Wörterbuch zurückrechnen. Fehlt die Liste,
meldet der Guard das ausdrücklich, statt still zu bestehen.

## Preise

Die Preislogik bleibt unverändert: Variantenpreis × Menge, abgerechnet durch Shopify.

- **Raummaß:** eine Variante „Wunschmaß“ je Farbe, Preis je m² = Meterware-Preis × 1,35, auf Cent gerundet.
  Abgerechnet wird wie bei der Meterware auf volle m² aufgerundet.
- **Einfassprodukte:** Der Variantenpreis gilt pro 0,01 m² (`custom.preis_pro_001_qm`). Deshalb sind
  **nur volle Euro je m²** exakt darstellbar: 129 € geht, 129,90 € nicht. Der Planer meldet das als Konflikt.
- **Rund und oval** werden nach dem umschließenden Rechteck abgerechnet, denn so viel Teppich wird zugeschnitten.

### Kante im m²-Preis enthalten (`service.kante_inklusive`)

Normalfall bei `Ketteln`: Die Kante kommt als zweite Warenkorbzeile dazu (Produkt `kettelservice`, Preis je
0,01 lfm, Block-Einstellung `kettelservice_produkt`), und ab-Preis sowie Kategorie-Rechner rechnen sie ein.
Ist der Kettelservice konfiguriert, aber nicht kaufbar, sperrt der Konfigurator den Kauf (TP-005).

Manche Hersteller-Ware hat einen UVP je m², der die Kettelung schon enthält. Dafür trägt das Einfassprodukt
`service.kante_inklusive = true` (Produkt-Metafeld, Typ boolean). Dann gilt:

- Konfigurator (`blocks/tp-einfass-konfigurator.liquid`, `assets/tp-einfass-konfigurator.js`): keine
  Kettelservice-Zeile, keine Kantenkosten, der Mindestpreis hebt allein die Fläche an. Der Preishinweis nennt
  „Kettelung … im Quadratmeterpreis bereits enthalten“. Die Line-Item-Properties bleiben vollständig
  (Einfassung: Gekettelt, Kante umlaufend, Garn) und bekommen zusätzlich `Kettelung: im m²-Preis enthalten`.
  TP-005 greift hier nicht, denn der Kettelservice wird gar nicht geladen.
- ab-Preis (`snippets/tp-teppich-ab-preis.liquid`) und Kategorie-Rechner (`snippets/tp-teppich-rechner-daten.liquid`
  liefert `kante_inkl`, `assets/tp-teppich-rechner.js`) zählen keine Kante dazu.
- Entscheidungsregel einmal im Rechenkern: `TPMass.kettelSeparat(art, kanteInklusive)`.
- Nur echtes `true` zählt. Fehlt das Feld, ist es `false` oder ist die Art nicht `Ketteln`, bleibt alles wie bisher.
- Tests: `tp-einfass-kettelservice-validierung`, `tp-teppich-ab-preis`, `tp-teppich-rechner-fertig`,
  `masstepich-rechnung`, `tp-einfass-fertig-pauschale`.

### Feste Bandfarbe (`service.bandfarbe_fest`, ab 2026-10-10)

Normalfall bei `Einfassband` und `Paspelband`: Der Kunde wählt eine Bandfarbe aus `snippets/tp-bandfarben`, ohne
Wahl bleibt der Warenkorb-Knopf gesperrt („Bitte Bandfarbe wählen“).

Manche Hersteller arbeiten das Band immer in der empfohlenen Farbe der Qualität. Dafür trägt das Einfassprodukt
`service.bandfarbe_fest` (Produkt-Metafeld, Text, ohne Metafeld-Definition), z. B. „Ton in Ton (Herstellerempfehlung)“.
Ist der Wert nach `strip` nicht leer, gilt:

- Konfigurator (`blocks/tp-einfass-konfigurator.liquid`, `assets/tp-einfass-konfigurator.js`): kein Schritt
  „Bandfarbe“, keine Farbpunkte, stattdessen der Hinweis „Bandfarbe: <Wert>“ unter den Maßen. Der Kauf hängt an
  keiner Bandwahl; die Line-Item-Property `Bandfarbe` ist der feste Wert (auch in `_Zuschnitt`). Die Vorschau zeigt
  das Band aus dem Material, leicht abgesetzt, statt der gestrichelten „noch wählen“-Kante.
- ab-Preis (`snippets/tp-teppich-ab-preis.liquid`) und Kategorie-Rechner (`snippets/tp-teppich-rechner-daten.liquid`,
  `assets/tp-teppich-rechner.js`): unverändert – sie rechnen ohne Band (das Band steckt im m²-Preis) und setzen
  keine Bandauswahl voraus.
- Nur bei `Einfassband`/`Paspelband`. Fehlt das Feld oder ist es leer, bleibt alles wie bisher.
- Tests: `qa/tests/tp-einfass-bandfarbe-fest.test.mjs`.

### Chip-Beschriftung (`service.einfass_label`, ab 2026-10-10)

`blocks/tp-einfass-wechsel.liquid` beschriftet die Chips fest nach Art (Cover, Gekettelt, Einfassband, Paspelband).
Trägt ein Produkt der Gruppe `service.einfass_label` (Text), steht dieser Wert auf seinem Chip – auf der eigenen
Seite (aktiver Chip) wie auf den anderen Seiten der Gruppe (Link). Leer oder fehlend: feste Beschriftung.
Tests: `qa/tests/tp-einfass-wechsel-label.test.mjs`.

## Musterprodukt

Der Muster-Aufruf führt auf `/pages/muster?produkt=<handle>`. Gibt es kein `muster-<handle>`, nimmt der
Musterkonfigurator das Musterprodukt des Teppichbodens (`service.einfass_basis`), sofern es die Farbe führt, erst
danach `kostenloses-muster`. Details: `domains/shopify/benachrichtigungen/musterartikel.md`.

## Werkzeuge

```
npm run masstepich:plan -- --snapshot <produkte.json>                 # Plan, führt nichts aus
npm run masstepich:guard                                              # Theme
npm run masstepich:guard -- --snapshot <produkte.json>                # zusätzlich Produktdaten
node --test qa/tests/masstepich-*.test.mjs
```

Die Freigabeliste liegt zusammen mit Aufschlag und Preisen in einer internen Konfiguration außerhalb des
Repositorys, und zwar **je Variante**: Eine später hinzugekommene Farbe ist nicht freigegeben.

Bei jedem Konflikt plant der Planer für diese Farbe bzw. dieses Produkt nichts. Konflikte sind:
- ein mehrdeutiger Preis,
- ein von Hand gesetzter Wert, auch an einer Wunschmaß-Variante,
- eine neue Variante,
- verschieden breite Rollen je Farbe,
- eine cm-genaue Meterware,
- ein Lieferantenname im Titel.

Die Entscheidung trifft dann ein Mensch.

## Stolperfallen, die hier schon Zeit gekostet haben

- `<svg>` hat keine Eigenschaft `hidden`. `svg.hidden = false` setzt nur eine JS-Eigenschaft, das Attribut
  bleibt stehen. Deshalb `setAttribute('hidden', '')` bzw. `removeAttribute('hidden')` verwenden.
- Zahlenfelder im Block-Schema erlauben nur eine Nachkommastelle. `18.75` bricht den Theme-Push. Die
  Deckung der Haftunterlage ist deshalb ein Textfeld „18,75“.
- Die Farbnummer steht in `custom.farbcode` und weicht teils von der SKU-Endung ab (`99` statt `099`). Neue
  Varianten kopieren die Metafelder von der Meterware-Variante, statt die Nummer aus der SKU abzuleiten.

## Vor dem Veröffentlichen offen

1. Preise je Einfassart (und Mindestpreis). Solange sie fehlen, legt der Plan die Produkte nicht an.
2. Warenkorb-Zähler: Einheiten zu 0,01 m² zählen als Stückzahl (1000 statt 1). Das gilt schon heute für
   jedes cm-genaue Produkt und muss vor dem Veröffentlichen der Einfassprodukte gelöst sein.
3. Die Raummaß-Variante erscheint wie jede Variante im Google-Feed. Ob sie ausgeschlossen wird, ist zu entscheiden.
4. Produkt für Kettelleisten fehlt noch. Solange es fehlt, erscheint der Schritt nicht.
5. `templates/product.rolle.json`: Block-Einstellungen (Kettelleisten, Haftunterlage) erst nach dem Merge von PR #191 setzen.
6. **Reihenfolge:** Wunschmaß-Varianten erst anlegen, wenn dieser Code live ist. Der bisherige Rechner erkennt
   eine Breitenoption mit dem Wert „Wunschmaß“ nicht mehr als Breite und zeigt dann nur noch eine feste Breite.
7. Schnellkauf und Variantenwähler außerhalb des Rechners prüfen (Kollektionskarten, Quick-Add):
   „Wunschmaß“ darf dort nicht wählbar sein. Sonst landet 1 m² ohne Maßangabe im Warenkorb.

## Gruppen auf der Kategorieseite (2026-10-02)

Die Seite Teppich nach Maß zeigt die Qualitäten nicht mehr als ein Raster, sondern in Gruppen: oben
Wegweiser-Karten (`sections/tp-teppiche-gruppen`), darunter je Gruppe eine Reihe
(`tp-zubehoer-produkte`, Einstellung „Teppich-Gruppe“). Die Zuordnung steht allein in
`snippets/tp-teppich-gruppe` und kommt aus den Daten des Teppichbodens (`service.einfass_basis`) –
mit einer Ausnahme vorweg: Design-Teppiche.

| Gruppe | Regel | Stand |
|---|---|---|
| Design-Teppiche | `service.einfassung` = Fertig (Wunschmaß vom Hersteller, gemustert, bis 200 cm breit, kein Teppichboden dahinter). Geht allen anderen Regeln vor. Kennung `design`, Anker `#design`, Reihe `tp_gruppe_design` direkt vor „Weitere Qualitäten“ (2026-10-10). | neu; bis dahin unter „Weitere“ (dort live 28 am 10.10.) |
| Natur | erstes `custom.fasermaterial` Naturfaser (Schurwolle, Sisal …) oder `custom.arten` = Wolle | 14 |
| Extra flauschig | `custom.konstruktion` Velours und `custom.florhohe` ab 10 mm | 8 |
| Weich | Velours unter 10 mm | 13 |
| Fest & robust | Schlinge oder Nadelvlies | 15 |
| Weitere Qualitäten | keine Regel greift (Daten fehlen) – Reihe erscheint nur dann | 0 |

Neue Teppiche ordnen sich selbst ein, sobald Konstruktion, Florhöhe und Faser am Teppichboden gepflegt
sind. Wie der Mass-Rechner liest die Seite höchstens 50 Produkte der Kollektion.

Die Wegweiser-Karten stehen ab 900 px in einer Reihe, gleich breit, egal ob 4 oder 5 Gruppen Teppiche
haben. Darunter zwei Spalten; bei ungerader Anzahl nimmt die letzte Karte die volle Breite
(`assets/tp-teppiche.css`). Tests: `qa/tests/tp-teppich-gruppe.test.mjs`.

## Wunschmass vom Hersteller (Art „Fertig“, ab 2026-10-08)

Fuer Lieferant B fertigt der Hersteller den Teppich nach Mass und fasst ihn ein; wir
schneiden nichts zu. Template `product.wunschmass-fertig` (Basis `dekofell`, Konfigurator
statt Groessenkarten, keine Empfehlungen, kein Muster).

| Feld | Wert |
|---|---|
| `service.einfassung` | `Fertig` |
| `service.max_breite_cm` | 200 (Paketversand: kuerzere Seite = Rollenlaenge) |
| `service.max_laenge_cm` | 600 |
| `service.kg_pro_qm` / `service.max_gewicht_kg` | kg je m² laut Datenliste / 30 – nur gemeinsam |
| `service.formen` | `["Rechteck"]` (Rund/Oval erst nach Bestaetigung je Qualitaet) |
| `custom.preis_pro_001_qm` | true; Variantenpreis = UVP je m² / 100 |

- Keine Basisvariante, kein Kettelservice. Der Guard (`scripts/masstepich/guard.mjs`) prueft
  fuer `fertig` nur Preisflag, Grenzen, Gewichtspaar und Formen.
- Pauschale je Teppich (Dropship-Gebuehr des Lieferanten, Inhaber 2026-10-08: 14,99 €):
  Produkt `wunschmass-pauschale`, Block-Einstellung `pauschale_produkt`. Sie geht mit
  Menge 1 unter derselben `_Gruppe` in den Warenkorb und steckt im ab-Preis. Ist sie
  konfiguriert, aber nicht kaufbar, sperrt der Konfigurator den Kauf.
- Gewichtsgrenze: abgerechnete Flaeche × kg/m² ≤ Hoechstgewicht, sonst Meldung mit der
  groesstmoeglichen Flaeche.
- Tests: `qa/tests/tp-einfass-fertig-pauschale.test.mjs`, `masstepich-rechnung` (Gewicht),
  `masstepich-plan` (Guard).

## Produktseite: Datenblock, Muster, strukturierte Daten (2026-10-08)

Gemeinsame Vorlage `templates/product.einfassung.json` (alle Teppiche nach Maß mit Ketteln, Einfassband,
Paspelband, Cover; **nicht** `product.wunschmass-fertig.json`).

| Was | Wie |
|---|---|
| Technische Daten | Akkordeonzeile „Technische Daten“ vor dem Beschreibungstext, darin `tp-produktinfo-tabelle` wie auf der Meterware-Seite. Der Teppich trägt selbst keine `custom.*`-Merkmale: je Zeile gilt der Wert am Produkt, sonst der des Teppichbodens (`service.einfass_basis`). Fehlt er dort, fehlt die Zeile (Stand: Fußbodenheizung ist an den Teppichböden noch nicht gepflegt, also keine Zeile). |
| JSON-LD `additionalProperty` | `snippets/tp-produkt-merkmale-json.liquid` bekommt den Teppichboden als `basis` und wendet dieselbe Regel an wie die Tabelle. |
| JSON-LD `FAQPage` | `snippets/tp-faq-beschreibung-structured-data.liquid` liest die Gruppe `<h3>Häufige Fragen</h3>` mit `<h4>`-Fragen aus dem sichtbaren Beschreibungstext. Nur auf Vorlage `einfassung`; ohne solche Gruppe kein Knoten. |
| JSON-LD `availability` | Produkt-Tag `auslauf` (wie der Hinweis in `tp-aktion-hinweis`): lieferbare Varianten melden `LimitedAvailability`, nicht lieferbare `OutOfStock`. Gilt in `tp-product-structured-data` für alle Produkte mit dem Tag, nicht nur für Teppiche nach Maß. |
| Muster-Aufruf | `tp-muster-cta` steht direkt unter der Farbwahl (Schritt 1), nicht mehr unter dem Rechner. Einstellungen und Ziel unverändert; die Zeile „Fragen zu Ihrem Maß? Beratung“ gehört zum Block und wandert mit. |
| Kopfpreis | Sichtbar ist nur „ab X €, z. B. 80 × 150 cm, inkl. Kettelung“ bzw. der Live-Gesamtpreis des Rechners. Der Preis je m² erscheint nur noch im Rückfall, wenn sich der ab-Preis nicht belegen lässt (`snippets/tp-teppich-ab-preis`, Entscheidung 2026-09-20). |

Das JSON-LD nennt den Preis je m² (`offers.price` = Variantenpreis × 100, mit `UnitPriceSpecification` je 1 MTK).
Das ist der einzige belegte Einheitspreis dieser Produkte und bleibt unverändert; sichtbar auf der Seite steht der
ab-Preis für ein Beispielmaß. Tests: `qa/tests/produkt-jsonld-massteppich.test.mjs`,
`tp-produkt-merkmale-basis.test.mjs`, `einfassung-template-reihenfolge.test.mjs`.
