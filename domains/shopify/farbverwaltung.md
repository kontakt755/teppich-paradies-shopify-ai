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
| `lieferant` | nein | `Lieferant A Coloria` (nur intern) |
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
   siehe Memory zu den unbrauchbaren Farbattributen von Lieferant A).
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
Farbnamen (`1209 anthrazit`). Abgeschrieben von Lieferant A, je Linie eine Produktseite;
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

### Zurueckgezogen: die Shop-SKUs sind korrekt

Hier stand bis zum 2026-09-09 der Befund, 32 der 37 Feldwin-SKUs wichen von den
Lieferanten-Artikelnummern ab. **Das war ein Fehlschluss.** Nachgeprueft an jeder
einzelnen Farbseite bei Lieferant A: **37 von 37 Shop-SKUs stimmen exakt mit der
Lieferant-A-Artikelnummer ueberein.** Rohdaten: `domains/shopify/doellken-artikelnummern-2026-09-09.json`.

Der Fehler war, zwei verschiedene Nummernsysteme zu vergleichen:

| System | Beispiel 60mm anthrazit | wo es steht |
|---|---|---|
| Lieferant-A-Artikelnummer | `ZUBDÖLK60_0004` | SKU im Shop, Bestellung beim Grosshaendler |
| Doellken-Farbnummer | `1209` | `custom.farbcode`, Farbregister, Herstellerkatalog |

Beide sind richtig und stehen nebeneinander. Der Suffix `_0004` ist die laufende
Position innerhalb der Linie bei Lieferant A, nicht die Farbnummer. Dass dieselbe Farbe je Leistenhoehe
eine andere Positionsnummer hat, ist deshalb kein Datenfehler, sondern die Systematik von Lieferant A.

**Die SKUs duerfen nicht auf die Doellken-Farbnummern gezogen werden.** Genau dann waere
die Bestellung beim Grosshaendler nicht mehr moeglich - die Wirkung waere das Gegenteil
dessen, was der Befund versprach.

**Ohne Nummernquelle** (13 Varianten, beide Produkte auf Entwurf, fuer Kunden unsichtbar):
`AW Ganges Teppichboden` (7) und `Eichenhain - Design-Klebevinyl` (6) haben gar keine SKU.
Ohne Nummer kein Registereintrag - das holt der Farb-Nachzug nach, sobald die Produkte
SKUs bekommen.

**AW Ganges: Farbnummern nicht auffindbar (geprueft 2026-09-09).** Die sieben Farbnamen sind
bereits sauber deutsch (`Rot Bordeaux`, `Weiß Creme`); nur `Grau dunkel` wurde auf
`Grau Dunkel` angeglichen. Eine Farbnummer liess sich nirgends abschreiben:

- keine SKU, kein Barcode, kein Variantenbild
- `grosshandel.sku` nennt `Lieferant B Ambiente 2025 1312 Ambiance` - eine Kollektion, keine Farbe
- der Grosshaendler Lieferant A fuehrt weder `Ganges` noch `Ambiance` Teppichboden;
  das Produkt stammt von Lieferant B, nicht von Lieferant A
- die Herstellerseite von Associated Weavers fuehrt `Ganges` nicht oeffentlich

Ein Hinweis fuer den naechsten Anlauf: Die drei Produktbilder heissen `GGESTA_21.jpg`,
`GGESTA_21_LIVING.jpg` und `GGESTA_33_LIVING.jpg`. Die 21 und die 33 **koennten**
Farbnummern sein, es gibt aber nur drei Bilder fuer sieben Farben und keine Zuordnung zu
einer Variante. Daraus eine Nummer abzuleiten waere geraten - deshalb steht es hier als
Spur und nicht im Farbregister. Die Farbnummern muessen aus der Lieferant-B-Preisliste kommen.

**Eichenhain: Farbnamen eingedeutscht (2026-09-09).** Die sechs Werte hiessen
`Prestige Oak Honey Braun` und `Infinity Oak Naturel` - Lieferanten-Dekornamen mit
angehaengter deutscher Farbe. Bei Bodenbelaegen gilt die Eigennamen-Regel: die
Lieferantenlinie gehoert nach `grosshandel.sku`, nicht in den Optionswert.

| vorher | jetzt |
|---|---|
| Prestige Oak Honey Braun | Eiche Honigbraun |
| Infinity Oak Naturel | Eiche Naturell |
| Prestige Oak Greige Grau | Eiche Greige |
| Prestige Oak Brown Grau | Eiche Braungrau |
| Prestige Oak Natural | Eiche Natur |
| Prestige Oak White Beige | Eiche Weissbeige |

`Naturel` und `Natural` waeren beide zu "Eiche Natur" geworden. Die Unterscheidung
`Naturell` gegen `Natur` haelt den Unterschied des Originals fest, ohne eine Farbe zu
erfinden - nur zwei der sechs Varianten haben ueberhaupt ein Bild, und das sind Raumbilder.

**Anders als bei Skarven wurden hier keine Tags mit den Originalnamen gesetzt.** Sockelleisten
werden ueber den Dekornamen des Herstellers gesucht; ein Bodenbelag traegt bei uns bewusst
einen Eigennamen, und `Prestige Oak` als Tag waere die Lieferantenlinie, die laut Namensregel
nur in `grosshandel.sku` stehen darf.

**Pflegehinweis:** Nach jedem Produktimport gehoert der Farb-Nachzug dazu - Registereintrag,
`custom.farbcode`, `custom.farbe`. Sonst zeigt die Bestellung fuer neue Produkte keine
Farbnummer, und die Farbanzeige faellt auf den Optionswert zurueck.

## Nachbesserung 2026-09-09: Kontura, Amara, JK 34, Skarven

**Kontura (19), Amara (9), JK 34 (24 von 26): Nummer aus dem Optionswert entfernt.**
`Grau Dunkel (98)` wurde zu `Grau Dunkel`, `09 Betongrau` zu `Betongrau`. Die Nummer
steht weiterhin in `custom.farbcode`, im Register und in der SKU - sie war im Namen
nur doppelt. `Reinweiß` und `Transparent` bei JK 34 trugen keine Nummer und blieben.

Drei Kontura-Werte waeren nach dem Entfernen doppelt gewesen. Am Bild sind sie klar
verschieden, deshalb tragen sie einen eigenen Namen statt einer Ziffer:

| Nr. | vorher | Messwert | jetzt |
|---|---|---|---|
| 405 | Grün Dunkel | `#35322a` olivbraun | Oliv Dunkel |
| 406 | Grün Dunkel | `#333e3f` blaugruen | Petrol Dunkel |
| 514 | Grau Mittel | `#8f8b83` warmgrau, so hell wie 515 | Grau Warm |

**Skarven: Dekornamen auf Wunsch eingedeutscht (2026-09-09).**
Zuerst hatte ich sie stehen lassen, weil `Fashion Oak` und `Wild Oak` die Dekornamen von
Doellken sind und eine Sockelleiste passend zum Bodendekor gesucht wird. Nach Ruecksprache
wurden 26 Werte uebersetzt.

Uebersetzt wurde die **Bedeutung** (Holzart plus Attribut), nicht die Optik - eine Farbaussage
waere ohne Farbmuster geraten, und 45 der 62 Dekore haben beim Grosshaendler kein Foto.
Vier Dekore mit Foto wurden angesehen: `Fashion Oak` ist graubeige, daher `Eiche Greige`.

| vorher | jetzt |
|---|---|
| Wild Oak | Wildeiche |
| Grey Limed Oak | Eiche Grau Gekalkt |
| Bleached Ash | Esche Gebleicht |
| Tuscany Walnut | Nussbaum Toskana |
| Scandinavian Country Pl. | Skandinavische Landhausdiele |
| Smoked Oak White | Räuchereiche Weiß |

**Neun Werte blieben stehen**, weil sie keine uebersetzbare Bedeutung tragen: `Alumetallic`,
`Twist`, `Aruba`, `Natural Place`, `Boogie`, `Salsa`, `Quartett`, `Nussbaum Island`. Dazu
`Chene Gris` - franzoesisch fuer "Eiche Grau", aber dieser Name ist im selben Produkt von 2495
belegt, und ohne Farbmuster liesse sich kein unterscheidender Zusatz vergeben, ohne zu raten.

**Die Auffindbarkeit ist gesichert:** Der Lieferanten-Dekorname steht im `hinweis` jedes
Registereintrags, die vollstaendige Zuordnung in
`domains/shopify/skarven-dekornamen-deutsch-2026-09-09.json`. Wer im Katalog nach `Wild Oak`
sucht, findet dort `Wildeiche`. Zusaetzlich stehen sie seit 2026-09-09 als
Produkt-Tags am Artikel, im vorhandenen Schema `dekor: wild oak` (klein, wie `art:` und
`raum:`). Belegt: die Suche nach `Calistoga` und nach `Wild Oak` findet die Skarven-Leiste
sowohl in der Sofortsuche als auch in der Volltextsuche. Der Bodenleisten-Filter zeigt
weiterhin nur Arten, Verfuegbarkeit und Preis - `dekor:` taucht dort nicht als neue
Filtergruppe auf, weil die Filter fest konfiguriert sind.

### Farbnummern JK 34 geklaert (2026-09-09)

Der Widerspruch zwischen Name und Nummer bei `JK 34` (Silikon der Hausmarke von A) ist
aufgeloest. Die Hausmarke gehoert zu Lieferant A; der Farbwaehler des Artikels nennt Farbnummer und
Bezeichnung, die Attributtabelle die Artikelnummer. Rohdaten seit 2026-09-11 lokal
(siehe `domains/lieferanten/AUSGELAGERT.md`).

Zwei Farben tragen beim Hersteller **gar keine Zahlennummer**, und daran hing der ganze
scheinbare Konflikt:

| Farbe | Hausmarke von A fuehrt sie als | Artikelnummer | `custom.farbcode` jetzt |
|---|---|---|---|
| Nussbraun | `26 nussbraun` | `ZUBSARHAVS_26B` | `26` |
| Reinweiss | `N-Weiss, reinweiss` | `ZUBSARHAVS_26` | `N-Weiss` |
| Gelb | `25 gelb` | `ZUBSARHAVS_25G` | `25` |
| Transparent | `transparent` | `ZUBSARHAVS_25` | `transparent` |

Die Buchstaben `B` und `G` in der Artikelnummer sind keine Notloesung des Shops, sondern
stehen so beim Lieferanten: `_26` und `_25` waren fuer die beiden namenlosen Farben
vergeben, also bekamen die nummerierten ein Kuerzel angehaengt. Farbnummer und
Artikelnummer sind hier verschiedene Dinge - genau wie bei den Doellken-Leisten.

Alle 26 Shop-SKUs stimmen mit den Lieferant-A-Artikelnummern ueberein. Vier `farbcode`-Werte
wurden korrigiert, die uebrigen 22 waren schon richtig.

**Feldwin nachgezogen (2026-09-09):** Die sechs Feldwin-Sockelleisten schrieben ihre Farben
klein (`anthrazit`, `weiß RAL 9010`). 37 Optionswerte und die 11 Registereintraege stehen jetzt
in derselben Schreibweise wie bei Skarven. `RAL` bleibt gross, `(Sonderfarbe)` bleibt stehen -
diese Klammer ist ein Hinweis fuer den Kunden und keine Farbnummer.

Zwei bekannte Eigenheiten bleiben und sind kein Fehler:
`Platin (Sonderfarbe)` in der XL-60-Linie zeigt auf den Registereintrag `Platinsilber – 1246`,
weil der Lieferant beide unter 1246 fuehrt. Und `Lichtgrau` in der XL-80-Linie traegt den
Farbcode `1012/1202`, waehrend das Register `1012` nennt - die Doppelnummer steht so im
Lieferantenkatalog und wurde unveraendert abgeschrieben.
