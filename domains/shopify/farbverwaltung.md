# Farbverwaltung: Farbname und Farbnummer

Kunde sieht **„Grau Anthrazit“**. Intern gilt **„Grau Anthrazit – 4381“**. Beides ist
je Variante gespeichert, getrennt, und wandert mit der Bestellung mit.

## Die drei Datenfelder

| Feld | Wo | Inhalt | Sieht der Kunde |
|---|---|---|---|
| Produktoption `Farbe` | Variante (Optionswert) | Farbname, z. B. `Grau Anthrazit` | ja |
| Varianten-Metafeld `custom.farbcode` | Variante, Feld „Farbnummer“ (angepinnt) | Farbnummer, z. B. `4381` | nein |
| Varianten-Metafeld `custom.farbe` | Variante, Feld „Farbe (Farbregister)“ (angepinnt) | Verweis auf einen Eintrag im **Farbregister** | nein |

Das **Farbregister** ist das Metaobjekt `tp_farbe` (Admin → Inhalte → Metaobjekte →
„Farbregister (TP)“). Ein Eintrag je Farbe, Felder:

| Feld | Pflicht | Beispiel |
|---|---|---|
| `bezeichnung` (Anzeigename) | ja | `Grau Anthrazit – 4381` |
| `farbname` | ja | `Grau Anthrazit` |
| `farbnummer` | ja | `4381` |
| `lieferant` | nein | `Jordan Coloria` (nur intern) |
| `swatch` (Farbe) | nein | `#3a3a3a` – Fallback, wenn die Variante kein Bild hat |
| `bild` | nein | Farbbild |
| `hinweis` | nein | Freitext |

Wird dieselbe Farbe bei einem neuen Produkt wieder gebraucht, wählt man im
Varianten-Metafeld „Farbe (Farbregister)“ den vorhandenen Eintrag – die Nummer wird
nicht neu erfunden. Die Farbnummer ist **abgeschrieben, nie fortgezählt**
(`npm run farbcode:guard`).

## Wie das Theme die Farbe auflöst

`snippets/tp-farbe-daten.liquid` ist die einzige Stelle, die entscheidet, was „die
Farbe“ einer Variante ist. Aufruf:

```liquid
{% capture nummer %}{% render 'tp-farbe-daten', variant: v, product: product, feld: 'nummer' %}{% endcapture %}
```

`feld` ist `name`, `nummer`, `intern` (`Name – Nummer`) oder `swatch`.

- **Farbname** = Wert der Option `Farbe`/`Color`/`Dekor` der Variante. Fallback: Farbregister.
- **Farbnummer**, in dieser Reihenfolge:
  1. `custom.farbe` → Farbregister → `farbnummer`
  2. `custom.farbcode`
  3. Teil der SKU hinter dem letzten Unterstrich (`PVCJOKANEC_4381` → `4381`)

Dank Stufe 3 funktioniert die Bestellanzeige sofort für alle Produkte, deren SKU der
Regel `LIEFERANTENKÜRZEL_FARBNUMMER` folgt – auch ohne gepflegte Metafelder.

## Varianten mit Farbe **und** Breite/Größe

Die Zuordnung hängt an der **Variante**, nicht am Farbwert. `Grau Anthrazit / 200cm`
und `Grau Anthrazit / 400cm` sind zwei Varianten und tragen beide dieselbe
Farbnummer (gleicher Registereintrag bzw. gleiche `custom.farbcode`). Der
Farbname kommt aus der Position der Farboption, deshalb ist es egal, ob `Farbe` die
erste oder zweite Option ist.

## Wo die Farbnummer intern sichtbar wird

`snippets/tp-farbe-properties.liquid` hängt zwei Line-Item-Properties an jedes
Produktformular (Produktseite `blocks/buy-buttons.liquid`, Schnellkauf
`snippets/quick-add.liquid`):

| Property | Sichtbar | Wo |
|---|---|---|
| `Farbnummer: 4381` | ja | Warenkorb, Checkout, Bestellbestätigung (E-Mail), Bestellung im Admin, Packzettel |
| `_Farbe intern: Grau Anthrazit – 4381` | nur intern | Bestellung im Admin, Packzettel, Bestell-Export, Admin-API (`customAttributes`) |

Properties mit Unterstrich blendet Shopify im Storefront und in Kunden-E-Mails aus.
Im Warenkorb steht damit unter der Position: `Grau Anthrazit, 200cm` und darunter
`Farbnummer: 4381`. In der Admin-Bestellung stehen Farbname (Variantentitel),
Farbnummer und die interne Bezeichnung untereinander.

Bei einem Variantenwechsel auf der Produktseite rendert Horizon nur den
Variantenwähler neu. `assets/tp-farbe.js` hört auf `variant:update` und schreibt die
versteckten Inputs aus einer JSON-Karte aller Varianten um, die das Snippet mitliefert.
Ohne Farbnummer wird der Input `disabled` und nicht mitgeschickt.

## Kundenansicht

- `blocks/tp-farbanzeige.liquid` („TP Farbanzeige“): ruhige Zeile mit rundem
  Swatch (Variantenbild, sonst Register-Farbe) und dem Farbnamen. Die Einstellung
  „Interne Farbnummer klein anzeigen“ ist **aus**; sie ist für Telefon-Beratung
  gedacht, nicht für den Standardfall.
- Variantenwähler, Swatch-Picker und Kollektionskarten zeigen weiterhin nur den
  Optionswert, also den Farbnamen. Nirgends im Storefront erscheint die Nummer von
  selbst.
- Der Block sitzt in allen sechs Produkt-Templates direkt hinter dem
  Variantenwähler (`tp_farbanzeige_tp1`). Bei Produkten ohne Farboption rendert er
  nichts.

## Pflege bei neuen Produkten

1. Optionswert `Farbe` = Farbname, so wie der Kunde ihn lesen soll.
2. SKU nach dem Muster `KÜRZEL_FARBNUMMER` vergeben.
3. Varianten-Metafeld „Farbnummer“ (`custom.farbcode`) eintragen.
4. Falls die Farbe schon existiert: im Farbregister suchen (Filter „Farbnummer“)
   und unter „Farbe (Farbregister)“ verknüpfen. Sonst neuen Registereintrag anlegen.

Per API (Bulk): `productVariantsBulkUpdate` mit
`metafields: [{namespace:"custom", key:"farbcode", type:"single_line_text_field", value:"4381"}, {namespace:"custom", key:"farbe", type:"metaobject_reference", value:"gid://shopify/Metaobject/…"}]`;
Registereinträge mit `metaobjectUpsert(handle:{type:"tp_farbe", handle:"4381-grau-anthrazit"}, …)`.

## Geänderte und neue Theme-Dateien

| Datei | Änderung |
|---|---|
| `snippets/tp-farbe-daten.liquid` | neu – zentrale Auflösung Farbname/Farbnummer |
| `snippets/tp-farbe-properties.liquid` | neu – Line-Item-Properties + Variantenkarte |
| `blocks/tp-farbanzeige.liquid` | neu – Farbzeile mit Swatch auf der Produktseite |
| `assets/tp-farbe.js` | neu – Aktualisierung bei `variant:update` |
| `blocks/buy-buttons.liquid` | eine Render-Zeile nach dem `id`-Input |
| `snippets/quick-add.liquid` | eine Render-Zeile nach dem `quantity`-Input |
| `templates/product*.json` (6 Dateien) | Block `tp_farbanzeige_tp1` hinter dem Variantenwähler |

Angelegt im Shop (Admin API, 2026-09-08): Metaobjekt-Definition `tp_farbe`
(`gid://shopify/MetaobjectDefinition/59232420174`) und Varianten-Metafeld-Definition
`custom.farbe` (`gid://shopify/MetafieldDefinition/541635117390`). `custom.farbcode`
bestand bereits.

## Befund Altbestand (2026-09-08)

Von 50 aktiven Teppichboden-Produkten tragen **47** als Optionswert nur eine Nummer
(`Farbe 83`) und **2** den Namen mit Nummer in Klammern (`Grau Dunkel (98)`). Nur
Fortiva Nadelvlies und die Linoleum-Linien haben reine Farbnamen.

Das Theme fängt beides ab: Klammer-Nummern werden für die Anzeige abgeschnitten und
die Farbnummer kommt aus der SKU (`TEPRIVAO4_098` → `098`). Bei `Farbe 83` kann das
Theme aber keinen Namen erfinden – der Kunde sieht weiterhin `Farbe 83`.

Der saubere Weg ist ein Datenlauf, kein Theme-Code:

1. Je Linie Farbnamen aus dem Bild bestimmen (Lieferanten-Attribute sind unbrauchbar,
   siehe Memory `jordanshop-farbattribute-unbrauchbar`).
2. Optionswerte per `productOptionUpdate` umbenennen (`Farbe 83` → `Grau Hell`), nicht
   per `productSet`.
3. `custom.farbcode` aus dem SKU-Suffix setzen, Registereintrag anlegen, `custom.farbe`
   verknüpfen.

Dieser Lauf ändert Produktdaten und braucht eine ausdrückliche Freigabe.

## Datenlauf 2026-09-08 (erledigt)

- Farbregister: 729 Einträge (`tp_farbe`), Handle = `<lieferantenkürzel>-<farbnummer>`, z. B. `tepriva-098`.
- 78 Produkte / 1204 Varianten: `custom.farbcode` aus dem SKU-Suffix gesetzt und `custom.farbe` verknüpft. Gegengeprüft: 729 Metaobjekte, 1204/1204 Varianten, 5 Stichproben ohne Abweichung.
- Farbnamen für alle 459 offenen Einträge am 2026-09-08 aus den Produktbildern gemessen (Median-RGB des Bildkerns → Grundton + Helligkeit) und ins Register geschrieben: `farbname`, `bezeichnung`, `swatch` (Hex) und ein `hinweis` mit dem alten Optionswert.
- Optionswerte umbenannt: 48 Produkte, 459 Werte, von `Farbe 83` auf den Farbnamen. `productOptionUpdate` mit `variantStrategy: LEAVE_AS_IS` — keine Variante wurde neu angelegt, SKU und `custom.farbcode` blieben unverändert. Gegengeprüft: 459 von 459 Werten stimmen, kein `Farbe NN` mehr übrig.
- **Das wirkt sofort im Live-Shop**, weil Optionswerte Produktdaten sind und kein Theme. Rückroll je Produkt über `domains/shopify/farbnamen-rueckroll-2026-09-08.json` (alte und neue Namen je Optionswert-ID).
- Liegen mehrere Farben eines Produkts im selben Ton, trennt die Messung mit `Warm`/`Kühl`, dann `Meliert` (Texturstreuung), dann `Heller`/`Dunkler`, zuletzt einer Ziffer. Diese Zusätze markieren die Fälle, die eine menschliche Prüfung am Bild verdienen — die Liste steht in `domains/shopify/farbnamen-vorschlag-2026-09-08.md`.
- Offener Befund: Bei Novaris tragen 7 Varianten kein eigenes Variantenbild, obwohl das Produktbild existiert. Gemessen wurde deshalb über den Alt-Text des Produktbilds. Im Theme greift dort der Register-Swatch statt des Variantenbilds.

- Kein Eingriff in Benachrichtigungs-Templates: Shopify zeigt sichtbare Line-Item-Properties in der Bestellbestätigung von selbst an.

## Nachzug 2026-09-09: Zubehoer

Nach dem Datenlauf sind Produkte hinzugekommen und umgebaut worden. Der Nachzug ist deshalb kein einmaliger Schritt.

**Erledigt** (77 Varianten, gegengeprueft 77 von 77):

| Produkt | Varianten | Nummernquelle |
|---|---|---|
| Skarven Sockelleiste 60mm | 62 | SKU-Suffix, echte Doellken-Farbnummern |
| Cortessa Sockelleiste | 15 | SKU-Suffix `L600` bis `L615`, Luecke bei `L602` |

**Erledigt am 2026-09-09: die sechs Feldwin-Sockelleisten (37 Varianten).**
Die echten Doellken-Farbnummern stehen im Farbwaehler der Lieferantenseite, direkt vor dem
Farbnamen (`1209 anthrazit`). Abgeschrieben von jordanshop.de, je Linie eine Produktseite;
der Farbwaehler listet die ganze Linie. Rohdaten: `domains/shopify/doellken-farbnummern-2026-09-09.json`.

Aus 37 Varianten wurden **11 Registereintraege** - dieselbe Farbe traegt ueber alle sechs
Leistenhoehen dieselbe Nummer. Genau dafuer ist das Register da.

| Nummer | Farbe | Leistenhoehen |
|---|---|---|
| 1132 | weiß RAL 9010 | 100, 80, 60, 40, XL60, XL80 |
| 1013/5012 | weiß | 100, 80, 60, 40, XL60, XL80 |
| 1012 | lichtgrau | 100, 80, 60, XL60, XL80 |
| 1246 | platinsilber | 80, 60, 40, XL60, XL80 |
| 1245 | champagner | 100, 80, 60, 40 |
| 1209 | anthrazit | 100, 80, 60, 40 |
| 1144 | schwarz | 100, 80, 60 |
| 1190 | edelstahl | 80 |
| 1063 | silber | 60 |
| 1139 | steingrau | 60 |
| 1408 | weiß RAL 9016 | 60 |

Doppelnummern wie `1013/5012` stehen so beim Lieferanten und wurden unveraendert uebernommen.
Die Linie XL 60/19 fuehrt die Nummer 1246 als `platin, Sonder-FB.MM 200m`; im Shop heisst
die Variante `platin (Sonderfarbe)`. Das steht im Hinweis des Registereintrags.

### Offener Befund: die Shop-SKUs weichen von den Lieferanten-Artikelnummern ab

**32 der 37 SKU-Suffixe stimmen nicht.** Beispiel: `anthrazit` in der 60er-Leiste liegt im Shop
unter `ZUBDÖLK60_0004`, beim Lieferanten unter `ZUBDÖLK60_1209`. Das Muster `_0001` bis `_0009`
ist eine laufende Nummer, die es beim Lieferanten nicht gibt.

Das ist ein Bestellrisiko, kein Anzeigefehler: Wer nach der Shop-SKU beim Lieferanten bestellt,
findet den Artikel nicht. `custom.farbcode` traegt jetzt die richtige Nummer, die SKU nicht.
SKUs zu aendern ist eine geschuetzte Aktion und braucht eine ausdrueckliche Freigabe -
deshalb steht das hier und wurde nicht nebenbei erledigt.

**Ohne Nummernquelle** (13 Varianten, beide Produkte auf Entwurf, fuer Kunden unsichtbar):
`AW Ganges Teppichboden` (7) und `Eichenhain - Design-Klebevinyl` (6) haben gar keine SKU.
Das Produkt-Metafeld `grosshandel.sku` nennt nur die Kollektion
(`M-Plus Ambiente 2025 1312 Ambiance`), nicht die Farbe. Bei Eichenhain tragen die
Optionswerte ausserdem englische Lieferantennamen (`Prestige Oak Honey Braun`) - das ist
ein eigener Fall fuer die Namensregeln.

**Pflegehinweis:** Nach jedem Produktimport gehoert der Farb-Nachzug dazu - Registereintrag,
`custom.farbcode`, `custom.farbe`. Sonst zeigt die Bestellung fuer neue Produkte keine
Farbnummer, und die Farbanzeige faellt auf den Optionswert zurueck.

## Nachbesserung 2026-09-09: Kontura, Amara, JOKA, Skarven

**Kontura (19), Amara (9), JOKA (24 von 26): Nummer aus dem Optionswert entfernt.**
`Grau Dunkel (98)` wurde zu `Grau Dunkel`, `09 Betongrau` zu `Betongrau`. Die Nummer
steht weiterhin in `custom.farbcode`, im Register und in der SKU - sie war im Namen
nur doppelt. `Reinweiß` und `Transparent` bei JOKA trugen keine Nummer und blieben.

Drei Kontura-Werte waeren nach dem Entfernen doppelt gewesen. Am Bild sind sie klar
verschieden, deshalb tragen sie einen eigenen Namen statt einer Ziffer:

| Nr. | vorher | Messwert | jetzt |
|---|---|---|---|
| 405 | Grün Dunkel | `#35322a` olivbraun | Oliv Dunkel |
| 406 | Grün Dunkel | `#333e3f` blaugruen | Petrol Dunkel |
| 514 | Grau Mittel | `#8f8b83` warmgrau, so hell wie 515 | Grau Warm |

**Skarven: die englischen Namen bleiben - bewusst.**
`Fashion Oak`, `Calistoga Grey`, `Wild Oak` sind keine schlecht gepflegten Farbnamen,
sondern die Dekornamen von Doellken. Beim Lieferanten stehen sie identisch
(jordanshop.de, Farbwaehler des Artikels "Doellken S 60 TOP", 62 Werte). Eine Sockelleiste
wird passend zum Bodendekor gekauft; wer `Wild Oak` als Boden hat, sucht die Leiste unter
diesem Namen. Uebersetzt waere sie nicht mehr auffindbar, und ohne Farbfoto liesse sich die
Optik ohnehin nicht pruefen - 45 der 62 Dekore haben beim Grosshaendler kein Farbbild.

Geaendert wurde deshalb nur die Schreibweise: 26 Werte von `fashion oak` auf `Fashion Oak`,
damit nicht `anthrazit` neben `Weiß Standard` steht. Register nachgezogen, Gegenpruefung
62 von 62.

### Offener Befund: JOKA-Farbnummern

Bei `JOKA JK 34 Silikon-Dichtstoff` widersprechen sich Name und Nummer:

| Farbe | Nummer im alten Namen | `custom.farbcode` aus der SKU |
|---|---|---|
| Nussbraun | 26 | 26B |
| Gelb | 25 | 25G |
| Reinweiß | keine | 26 |
| Transparent | keine | 25 |

Die Buchstaben-Suffixe sehen aus wie eine Notloesung, um doppelte SKUs zu vermeiden.
Welche Nummer der Hersteller fuehrt, ist damit unklar - das klaert nur die JOKA-Preisliste.
Nicht geraten, deshalb steht es hier.

**Hinweis zur Einheitlichkeit:** Die sechs Feldwin-Sockelleisten schreiben ihre Farben
weiterhin klein (`anthrazit`, `weiß RAL 9010`). Das ist derselbe Fall wie bei Skarven,
war aber nicht beauftragt.
