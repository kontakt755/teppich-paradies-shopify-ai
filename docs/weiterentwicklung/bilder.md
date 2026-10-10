# Produktbilder: Ablage, Benennung, Bildrechte

Teil von `SHOPIFY_WEITERENTWICKLUNG.md` (Phase 7). Stand 2026-10-08, nur lesend erhoben.

## 1. Ist-Zustand

**Speicherort:** Alle Produktbilder liegen ausschließlich als Shopify-Medien am Produkt
(Shopify-CDN). Eine lokale Originalablage gibt es nicht; Importe hängen Bilder per
`productCreateMedia` direkt von der Lieferanten-URL an (Skill `produktimport`). Raumbilder
kommen aus der Lieferanten-Mediendatenbank (eigener Raumbild-Skill für Lieferant A) bzw. werden in
einem eigenen Chat erzeugt (Gedächtnis „Bilder macht ein anderer Chat“).

**Verbindung zu Shopify:** Produkt → Medien (Reihenfolge = Galerie), Variante → ein
Variantenbild. Bildnachweis nur auf Produktebene im Metafeld `custom.bildnachweis`
(sichtbar über `blocks/tp-bildnachweis.liquid`, z. B. bei Dekofell).

**Stichprobe** (120 zuletzt geänderte aktive Produkte, 285 Bilder, Shopify CLI):

| Merkmal | Befund |
|---|---|
| Format der Originale | 285 × JPG. Das CDN liefert automatisch WebP/AVIF aus (`image_url`), ein Hochladen als WebP bringt nichts. |
| ALT-Text | in der Stichprobe überall gesetzt |
| Breite unter 1200 px | 104 von 285 (37 %) – für Zoom und Retina-Galerie zu klein |
| Originale über 2 MB | 140 von 285 – unkritisch für Besucher (CDN skaliert), aber unnötig für Upload und Ablage |
| Dateinamen | gemischt: sprechend (`larissa-teppichboden-taupe-260-raumansicht.jpg`) neben Lieferanten-Exportnamen (`products_442562.jpg`) |
| gleicher Basisname mehrfach | 31 Fälle (u. a. Raumbilder, die mehreren Farben zugeordnet sind) |
| Bildrechte | kein Verzeichnis; nur `custom.bildnachweis` je Produkt |

## 2. Bildtypen (verbindliche Liste)

| Kürzel im Dateinamen | Typ | Herkunft | Rechte-Status zu Beginn |
|---|---|---|---|
| `produkt` | eigenes Produktfoto (freigestellt / Farbmuster) | eigenes Foto | eigen |
| `detail` | eigene Detailaufnahme (Kante, Rücken, Flor) | eigenes Foto | eigen |
| `struktur` | Oberflächen-/Strukturfoto | eigen oder Hersteller | je Quelle |
| `raum` | Raumbild (Foto) | Hersteller | Hersteller – Lizenz prüfen |
| `raumki` | KI-generiertes Raumbild | KI-Werkzeug | KI – Nutzungsbedingungen des Werkzeugs + Kennzeichnung prüfen |
| `hersteller` | unverändertes Herstellerbild | Hersteller | Hersteller – Lizenz prüfen |
| `herstellerbearb` | bearbeitetes Herstellerbild (Ausschnitt, KI-Erweiterung) | Hersteller + Bearbeitung | Bearbeitung muss die Lizenz erlauben |
| `marketing` | Banner, Kampagnen, Social | eigen / Agentur | je Quelle |
| `rest` | Foto eines Sonderpostens (Einzelstück) | eigenes Foto | eigen |

## 3. Dateinamen

Schema (Kleinbuchstaben, Bindestrich innerhalb, Unterstrich zwischen den Teilen, keine Umlaute):

```
<produktname>_<farbe>_<bildtyp>_<nn>.<endung>
serena_taupe_raum_01.jpg
serena_taupe_detail_02.jpg
serena_taupe_struktur_03.jpg
velory_grau_rest_sp-0007_01.jpg      (Sonderposten: SKU zwischen Typ und Nummer)
```

- `produktname` = Eigenname im Shop (nie der Lieferantenname, AGENTS.md Regel 8).
- `farbe` = Farbname wie in der Option `Farbe`, ohne Nummer; Farbnummer nur, wenn zwei
  Farben sonst gleich hießen (`larissa_grau-870_…`).
- Endung: das Original bleibt JPG/PNG. **Kein** Umwandeln nach WebP/AVIF vor dem Upload.
- Shopify hängt beim Upload eine UUID an, wenn der Name schon existiert – der
  sprechende Teil bleibt trotzdem erhalten und reicht für SEO und Wiederfinden.

**Technische Mindestwerte für neue Bilder:** lange Kante ≥ 2000 px, ≤ 5000 px; sRGB;
JPG-Qualität 82–88; Dateigröße möglichst < 1,5 MB. Raumbilder 3:2 oder 4:3, Produktbilder 1:1.

**ALT-Text:** `<Produktname> <Farbe> – <was man sieht>`, z. B. „Serena Teppichboden Taupe –
Raumansicht im Wohnzimmer“. KI-Raumbilder: „… – Beispieldarstellung“.

## 4. Ablage der Originale

Ein Ordner je Produkt, nur lokal oder in einem nicht synchronisierten Speicher, den der
Inhaber bestimmt (nicht iCloud/Schreibtisch, AGENTS.md):

```
<bildarchiv>/
  serena/
    original/        Originaldateien wie geliefert / fotografiert
    shop/            exakt die hochgeladenen Dateien (Namensschema)
    bildrechte.csv   ein Eintrag je Datei in shop/
```

Für Hunderte bis Tausende Bilder reicht diese Struktur, weil jede Datei über ihren
Namen einem Produkt und einer Farbe zugeordnet ist und `bildrechte.csv` maschinenlesbar bleibt.

## 5. Bildrechte-Verzeichnis

Eine Zeile je Bild (CSV, privat, da es Lieferantennamen und Lizenztexte enthält):

| Spalte | Beispiel |
|---|---|
| `datei` | `serena_taupe_raum_01.jpg` |
| `shopify_media_id` | `gid://shopify/MediaImage/…` (nach dem Upload) |
| `produkt_handle` | `serena-teppichboden` |
| `bildtyp` | `raum` |
| `quelle` | Lieferant A / eigenes Foto / KI-Werkzeug |
| `urheber` | Name Fotograf / Hersteller |
| `lizenz` | „Händlernutzung Online-Shop laut Lieferant-A-Bedingungen vom …“ |
| `beleg` | Link oder Ablageort der Lizenzbestätigung |
| `bearbeitet` | ja/nein + was |
| `quellenangabe_pflicht` | ja/nein + Wortlaut |
| `status` | `geprueft` · `ungeklaert` · `gesperrt` |
| `geprueft_von`, `geprueft_am` | |

**Regel:** Ein Bild ohne Zeile oder mit `ungeklaert` gilt als ungeklärt. Es wird nicht
gelöscht, aber in der Prüfliste geführt. Neue Bilder mit unbekannten Rechten werden nicht
hochgeladen.

**Erstbefüllung (automatisierbar, nur lesend):** Skript liest alle Produktmedien, schreibt
je Bild eine Zeile mit `status = ungeklaert` und füllt `quelle` vor, wo der Dateiname es
belegt (`*-raumansicht*` aus dem Lieferanten-Import, `products_*` aus Lieferanten-Export).
Danach entscheidet ein Mensch je Lieferant pauschal (eine Lizenz deckt alle Bilder desselben
Lieferanten), sodass nicht Tausende Einzelprüfungen nötig sind.

## 5a. Umsetzung und erster Lauf (2026-10-08)

- Logik: `operations/lib/bildrechte.mjs` (Tests: `operations/tests/bildrechte.test.mjs`).
- Lauf: `npm run bildrechte:inventur` – nur lesend, schreibt
  `$TP_PRIVAT_DIR/bildrechte/bildrechte.csv` (Semikolon, öffnet direkt in Excel/Numbers),
  sichert die vorige Fassung mit Zeitstempel. Handspalten (`quelle`, `urheber`, `lizenz`,
  `beleg`, `bearbeitet`, `quellenangabe_pflicht`, `status`, `geprueft_von`, `geprueft_am`,
  `notiz`) überschreibt der Lauf nie. Neue Bilder kommen immer als `ungeklaert`.
  Verschwundene Bilder bleiben mit Notiz stehen, damit dokumentierte Lizenzen nicht verloren gehen.
- `--nur-auswerten` zählt nur; `--input <datei>` liest einen Export statt der API.

**Erster Lauf (aktive + Entwurfs-Produkte):**

| Kennzahl | Wert |
|---|---|
| Bilder / Produkte | 8.530 / 1.293 |
| ungeklärt | 8.530 (noch niemand hat entschieden – erwartet) |
| schmaler als 1.200 px | 3.118 (Teppichboden 1.599, Teppich nach Maß 537, Sauberlauf 211, Klebevinyl 158, Parkett 101) |
| ohne ALT-Text | 0 |
| Herkunft am Namen erkennbar | 1.058 Raumbild-Importe (`*-raumansicht`), 1.130 Lieferanten-Exporte (`products_<nr>`), 6.342 ohne Hinweis |
| Bildtyp am Namen erkennbar | Raum 1.747, Detail 1.364, Struktur 2, ohne 5.417 |
| Dateiname nach neuem Schema | 0 (Schema gilt ab jetzt für neue Bilder; Altbestand wird nicht umbenannt) |

**Weg zur Klärung ohne Einzelprüfung:** Je Lieferant einmal die Lizenz klären (Inhaber), dann
alle Zeilen mit derselben Herkunft in der CSV gemeinsam auf `geprueft` setzen (Filter in Excel).
Altbestand nicht umbenennen – Shopify-Medien-URLs würden sich ändern, ohne Nutzen für Kunden.

## 6. Dashboard

Sinnvoll, aber klein (noch nicht gebaut, eigener PR nach der Sonderposten-Ansicht): eine Ansicht
„Bildrechte“ im Control Center liest `bildrechte.csv` und zeigt nur drei Listen – **ungeklärt**, **zu klein (< 1200 px)**,
**ohne ALT-Text** – mit Link zum Produkt. Keine Bildbearbeitung, kein Upload im Dashboard.

## 7. Offene Punkte

- Speicherort des Bildarchivs bestimmt der Inhaber.
- Lizenzbedingungen je Lieferant (Online-Shop, Social, Werbung, Bearbeitung erlaubt?) – der
  Inhaber hat die Verträge; ohne sie bleibt alles `ungeklaert`.
- KI-Raumbilder: Kennzeichnung als Beispieldarstellung ist bereits Praxis (Alt-Text); die
  Nutzungsbedingungen des eingesetzten Werkzeugs gehören als Beleg ins Verzeichnis.
