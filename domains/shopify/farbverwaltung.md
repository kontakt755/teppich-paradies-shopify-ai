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

## Was bewusst nicht gemacht wurde

- Keine Produktdaten verändert: keine Metafelder auf Varianten geschrieben, kein
  Registereintrag angelegt. Das Theme läuft über den SKU-Fallback sofort; die
  Befüllung des Registers ist ein separater, freigabepflichtiger Datenlauf.
- Kein Eingriff in Benachrichtigungs-Templates: Shopify zeigt sichtbare
  Line-Item-Properties in der Bestellbestätigung von selbst an.
