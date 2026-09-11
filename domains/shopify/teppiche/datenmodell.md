# Datenmodell Teppiche (`tp_rug.config`)

Ein JSON-Metafeld je Produkt: Namespace `tp_rug`, Schlüssel `config`, Typ `json`.
Im Entwurf **ohne** Metafeld-Definition (die wäre storeweit); die Testprodukte tragen es als
unstrukturiertes Metafeld. Vor dem Livegang: Definition anlegen (Storefront-Zugriff lesen),
danach optional in Einzelfelder aufteilen, wenn Filter in Search & Discovery gebraucht werden.

Gelesen wird **fail closed** über `normalizeProduct()` in `assets/tp-rug-core.js`:
Unbekanntes fällt weg, nie wird etwas geraten.

| Feld | Typ | Bedeutung | Fehlt / unbekannt |
|---|---|---|---|
| `enabled` | bool | Produkt nutzt den Konfigurator | ohne Metafeld: kein Konfigurator |
| `subtitle` | Text | Kurzzeile unter dem Titel | leer |
| `material`, `material_key` | Text | Anzeige und Filterschlüssel (`velours`, `hochflor`, `schlinge`, `flachgewebe`, `objekt`, `outdoor`, …) | kein Filter |
| `pile` | `kurz` · `mittel` · `hoch` · `flach` | Florhöhe | kein Filter |
| `fiber` | `kunstfaser` · `wolle` · `naturfaser` | Faser | kein Filter |
| `texture` | `velours` · `hochflor` · `schlinge` · `sisal` · `flach` · `wolle` | Zeichenstil der Vorschau | `velours` |
| `rooms` | Liste | Einsatzorte (`wohnzimmer`, `esszimmer`, …, `wohnmobil`, `outdoor`) | nicht gefiltert |
| `shapes` | Liste | **erlaubte** Formen: `rechteck quadrat rund oval ellipse laeufer halbkreis viertelkreis dreieck vieleck organisch freiform skizze schablone` | ohne Formen kein Konfigurator |
| `edges` | Liste | **erlaubte** Einfassungen: `kettel paspel baumwolle cover` | „Einfassung klären wir mit der Anfrage“ |
| `edge_widths` | Objekt | sichtbare Breite je Einfassung in cm, z. B. `{"paspel":1,"baumwolle":3}` | Standard aus dem Kern |
| `edge_colors` | Liste `{key,name,hex}` | Band-/Garnfarben | Demo-Auswahl (gekennzeichnet) |
| `antislip` | `optional` · `inklusive` · `nicht_verfuegbar` | Antirutschvlies | `nicht_verfuegbar` |
| `max_width_cm` | Zahl | Grenze der **kürzeren** Seite (z. B. Rollenbreite; bei Cover Rollenbreite − 10 cm) | keine Grenze, Hinweis „wir prüfen“ |
| `max_width_note` | Text | Herkunft der Grenze | – |
| `max_length_cm` | Zahl ≤ 1000 | Länge; shopweit höchstens 1.000 cm | 1.000 |
| `colors` | Liste `{name,hex,image?}` | Farben mit Swatch; bei echten Produkten ergänzt die Option „Farbe“ Bild/Swatch | Option „Farbe“ |
| `scene` | Szene | Illustration, bis Fotos da sind | `wohnzimmer` |
| `camper_suitable`, `outdoor_suitable`, `object_suitable`, `underfloor_heating`, `castor_chair`, `pet_friendly`, `easy_care` | bool | Eignungen – **nur bei `true` sichtbar**, nie abgeleitet | nicht angezeigt |
| `extras` | Liste `{key,label,text}` | weitere Extras (Komfortvlies, Fleckenschutz …) | keine |
| `pricing` | – | **vorbereitet, nicht belegt** – `quote()` liefert bis dahin `status: none` | keine Preise |

## Einfassungen – Begriffe

Geprüft 2026-09-11 gegen das Sortiment des Lieferanten (Details im internen Bericht):

- Der Lieferant führt eine Einfassung **„Kippkante“, immer inklusive Antirutschvlies**. Einen Artikel
  „Cover“ führt er nicht. Der Inhaber hat am 2026-09-11 entschieden: **Cover = bisher Kippkante**,
  nur mit Vlies. Im Shop heißt es daher „Cover (Kippkante)“, im Datenmodell `cover`.
  Falls später ein zweites, anderes System dazukommt, bekommt es einen eigenen Schlüssel.
- **Paspel** gibt es beim Lieferanten in zwei Ausführungen: ca. 1 cm (sichtbare Naht) und ca. 3 cm
  (verdeckte Naht). Deshalb `edge_widths` je Produkt statt fester Breite.
- **Baumwolle**: Einfassband ca. 3 cm, verdeckte Naht. Eine Microfaser-Variante ist möglich (später eigener Wert).
- **Kettelung**: Garnkante; Garnfarben liegen nicht vor.
- **Antirutschvlies** ist beim Lieferanten auch als eigene Rückenbeschichtung für abgepasste Teppiche geführt.

## Anfrage (was die E-Mail enthält)

Kontaktformular `contact[...]`: Name, E-Mail, Telefon, Nachricht, `Betreff`, `Referenz`,
`Konfiguration` (Klartext aus `summaryText()`), `Dateien` (nur Namen), `Quelle`.
Keine Preise, keine Dateien, keine Lieferantendaten.
