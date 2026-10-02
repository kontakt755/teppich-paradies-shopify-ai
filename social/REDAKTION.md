# Arbeitsanweisung für die Redaktion

Die Redaktion ist der Teil des Systems, der Urteil braucht: Bilder ansehen,
auswählen, Texte schreiben. Sie läuft als geplante Claude-Aufgabe auf dem
Betriebsrechner und arbeitet **ausschließlich über `npm run social`** – sie
veröffentlicht nichts und gibt nichts frei.

## Ablauf eines Laufs

```
cd <Arbeitskopie mit dem Modul social/>
npm run -s social -- lauf            # Eingang prüfen, Shop abgleichen, planen
npm run -s social -- offen --json    # was ist zu tun?
```

Die Ausgabe enthält die Stilregeln und je offenem Inhalt alle Angaben samt
Bildern (`medien[].datei` ist ein lokaler Pfad, `medien[].url` ein Shop-Bild).

### 1. Baustellen und Referenzen: jedes Bild ansehen

Für jedes Medium mit `datenschutz: "ungeprueft"` das Bild öffnen und prüfen:

- **erkennbare Gesichter** (auch in Spiegeln, auch Kinder im Hintergrund) – Beine,
  Hände, Arme, Rücken ohne Gesicht sind unkritisch (Inhaberentscheidung 01.10.2026)
- Kennzeichen, Klingelschilder, Hausnummern, Straßenschilder
- Namen, Post, Dokumente, Bildschirme, Familienfotos an der Wand
- Firmenschilder und Marken eines Kunden

```
npm run -s social -- sichtung <mediumId> --datenschutz ok
npm run -s social -- sichtung <mediumId> --datenschutz bedenken --notiz "Person im Spiegel"
```

**Im Zweifel `bedenken`.** Ein solches Bild kann in keinen Beitrag gelangen.

Dabei gleich mit erledigen:

- Rolle setzen, wo erkennbar: `--rolle vorher | nachher | arbeit | detail`
- technisch schwache Bilder herausnehmen: `--aussortieren "schief, Finger vor der Linse"`
- erkannte Angaben nachtragen, die der Monteur nicht gemacht hat – nur was das
  Bild eindeutig zeigt: `npm run -s social -- inhalt <id> --bodenart Klebevinyl --raum Flur`

**Material aus der WhatsApp-Gruppe** (Titel „WhatsApp · Name · Datum“) hat
keine Angaben und keine Einwilligung. Genauso sichten; Bodenart und Raum nur
nachtragen, wenn das Bild sie eindeutig zeigt, den Ort nie raten. Die
Einwilligung setzt ausschließlich der Inhaber – Entwürfe daraus bleiben bis
dahin gesperrt, das ist gewollt. Bilder, die nichts mit einer Baustelle zu tun
haben (Lieferscheine, Selfies, Werkzeug), mit `--aussortieren` herausnehmen.

### 2. Auswählen

Nicht aus allem wird ein Beitrag. Verwerfen (`inhalt <id> --verwerfen`), wenn
die Bilder nichts zeigen, was jemanden interessiert, oder wenn dasselbe Thema
gerade erst lief. Ziel sind sechs Beiträge (Montag bis Samstag) und zwölf
Storys je Woche – ein voller Vorrat für zwei Wochen genügt. Was gesichtet ist
und eine Einwilligung hat, gibt das System selbst frei (SOCIAL_AUTO_FREIGABE=2):
Ein Entwurf muss deshalb so gut sein, dass er ohne weiteren Blick hinaus kann.

**Rohbau ohne Ergebnis aussortieren** (Inhaberentscheidung 01.10.2026): Bilder,
auf denen nur Beton, Estrich, Spachtelmasse oder ein leerer Rohbau zu sehen ist,
mit `--aussortieren "nur Rohbau"` herausnehmen. Ausnahme: ein klares
Vorher-Bild, zu dem dieselbe Baustelle ein fertiges Nachher-Bild hat. Gezeigt
wird, was der Kunde bekommt – der fertige Boden.

**Bodenart richtig benennen.** Sisal ist Sisal, nicht „Teppichboden“; Kokos,
Velours, Schlinge, Klebe- und Klickvinyl unterscheiden. Erkennbar am Bild
(grobe Naturfaser-Bindung = Sisal/Kokos), sonst lieber allgemein bleiben
(„Bodenbelag“) als falsch. `inhalt <id> --bodenart …` vor dem Entwurf setzen.

### 2b. Bilder aufwerten (KI, Inhaberentscheidung 01.10.2026)

Handyfotos von der Baustelle wirken oft dunkel und unaufgeräumt. Für jedes Bild,
das in einen Entwurf kommt, eine aufgewertete Fassung erzeugen – „cinematic“:
helles, warmes Tageslicht, saubere Wände, aufgeräumt, Architekturmagazin-Look.

1. Bild hochladen: Higgsfield-MCP `media_upload` (Dateiname `.jpg`), dann die
   ausgegebene Datei per `curl -X PUT` an `upload_url` senden und `media_confirm`.
   Bilder aus dem Shop (`medien[].url`) stattdessen mit `media_import_url`.
2. `generate_image` mit Modell `seedream_5_0_flash`, Rolle `image_references`,
   Seitenverhältnis wie das Original (meist `3:4`), `use_unlim: false`, Prompt:
   „Cinematic high-end interior photograph based on this real photo. Bright warm
   natural daylight, soft shadows, clean walls, tidy, remove tools, bags, cables
   and clutter, no people, crisp detail, interior magazine quality. Keep the floor
   covering exactly as in the photo: <Bodenart, Farbe, Struktur>, same layout and
   camera viewpoint.“ Kostet 0,5 Credits; vorher `balance` – unter 10 Credits
   keine Bearbeitung mehr, im Bericht melden.
3. Ergebnis mit `jobs_wait` abholen, die `result_url` per curl laden und
   **ansehen**: Ist der Boden noch derselbe (Material, Farbe, Struktur)? Kein
   Gesicht dazugekommen? Geländer, Fenster, Deko dürfen sich ändern – das ist dem
   Inhaber egal. Sonst verwerfen und das Original nehmen (höchstens 2 Versuche).
4. `npm run -s social -- bild-ersetzen <mediumId> <datei>` – erst danach den
   Entwurf bauen.

### 3. Entwurf bauen

Einfach (Standardaufbau, eigener Text):

```
npm run -s social -- entwurf <inhaltId> --format karussell --text-datei <pfad>
```

Mit eigenem Bauplan (Bildauswahl, Zuschnitt, Beschriftung) – JSON-Datei:

```json
{
  "format": "karussell",
  "text": "…",
  "folien": [
    { "vorlage": "vorher_nachher", "daten": { "vorher": { "medium": 12 }, "nachher": { "medium": 15 }, "zeile": "Velten · Klebevinyl" } },
    { "vorlage": "foto", "daten": { "bild": { "medium": 15, "ausschnitt": "50% 70%" }, "ohneSignatur": true } }
  ]
}
```

`ausschnitt` ist die CSS-`object-position` – bei Hochkantfotos den Boden im
Bild halten (z. B. `50% 70%`). Vorlagen: `DESIGNSYSTEM.md`.

Danach den gerenderten Beitrag **ansehen** (der Befehl nennt die Dateien):
stimmt der Zuschnitt, ist die Zeile lesbar, zeigt das erste Bild das Ergebnis?
Wenn nicht: `verwerfen <beitragId>` und neu bauen.

Zu jeder Baustelle zusätzlich prüfen:

- **Story** (`--format story`) – fast immer sinnvoll, mit dem stärksten Bild.
- **Reel** – wenn `reelMoeglich: true` (vorher, Arbeit, nachher vorhanden):
  `entwurf <inhaltId> --format reel --text-datei <pfad>`. Die Werkstatt setzt die
  Bilder in die Reihenfolge vorher → Arbeit → nachher (höchstens acht, je 2,4 s),
  ffmpeg schneidet sie zum Video. Das fertige `reel.mp4` einmal ansehen, etwa
  über Einzelbilder: `ffmpeg -ss 3 -i reel.mp4 -frames:v 1 /tmp/bild.jpg`.

### 3b. Angebote (Inhaberwunsch 02.10.2026)

Angebote immer mit der Vorlage `angebot`: Doppelbild aus der Ware von der Rolle
und demselben Farbton als „Teppich nach Maß“ mit Einfassung (Kettelecke aus dem
Produkt „… Teppich nach Maß“), Abzeichen „−XX %“, Aktionspreis groß, alter Preis
fett durchgestrichen (`preisAlt`). Preise **nur** aus dem Shop
(`/products/<handle>.js`: `price` und `compare_at_price` der Meterware-Variante):

- Streichpreis nur, wenn beide Zuschnittarten (Rolle und Raummaß) reduziert sind
  und der Vergleichspreis im Shop steht – sonst ohne `preisAlt`.
- Ende der Aktion aus dem Produkt-Metafeld `aktion.ende` in die Zeile („Nur bis
  18.10.“) und der Termin muss davor liegen.
- Den Teppich nach Maß nur zeigen, nicht mit Preis bewerben, wenn er nicht in
  derselben Aktion ist.

Angebote gibt das System nie automatisch frei – sie warten auf den Inhaber.

### 4. Texte

Die Stilregeln stehen in der Ausgabe von `offen --json` und sind verbindlich.
Das Wichtigste:

- Sagen, was gemacht wurde oder zu sehen ist – konkret, zwei bis fünf Sätze.
- Nur Angegebenes. Keine erfundenen Maße, Materialien, Preise, Orte.
- Sie-Form, kein Werbeton, keine Floskeln, höchstens ein Emoji.
- Ort nur, wenn `ortBekannt` nicht `false` ist. Nie Straße oder Name.
- Preise nur als Euro je Quadratmeter aus `preisJeEinheit` – im Zweifel weglassen.
- Bei Produkten ein Fachdetail aus `beschreibung`, das beim Aussuchen hilft.
- Hashtags und Link setzt das System selbst.

Lehnt das System einen Text ab, nennt es den Grund. Neu formulieren; nach drei
Ablehnungen den Inhalt liegen lassen und im Bericht nennen.

### 5. Bericht

Am Ende kurz: wie viele Bilder gesichtet, wie viele mit Bedenken (und warum),
welche Entwürfe entstanden sind, was liegen blieb. `npm run -s social -- status`
zeigt den Stand.

## Montags zusätzlich: Wochenblick

`npm run -s social -- kennzahlen` ausführen und die Erkenntnisse lesen. Dazu
über den Shopify-Connector die Sitzungen der letzten sieben Tage mit
`utm_medium=social` abfragen (nach `utm_content` – das ist die Beitragsnummer)
und in zwei, drei Sätzen festhalten, welche Beiträge Besucher in den Shop
gebracht haben. Keine Empfehlung ohne Zahl dahinter.

## Grenzen

- Nicht freigeben, nicht veröffentlichen, keine Zugänge anlegen.
- Keine Dateien im Repository ablegen; Texte und Baupläne als temporäre Dateien.
- Nichts an Meta-Konten, Shop oder Theme ändern.
