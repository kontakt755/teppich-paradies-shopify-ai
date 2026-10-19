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
Storys je Woche – ein voller Vorrat für zwei Wochen genügt. Wie voll die Wochen
schon sind, steht in `npm run -s social -- status` (Beiträge und Storys je
Kalenderwoche) – erst nachsehen, dann Entwürfe bauen. Was gesichtet ist
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
(`/products/<handle>.js`: `price` und `compare_at_price` der Meterware-Variante).
Der Shop-Scout liefert beides fertig: `preisJeEinheit` und `vergleichJeEinheit`
(null, wenn nicht alle Varianten reduziert sind – dann kein `preisAlt`):

- Streichpreis nur, wenn beide Zuschnittarten (Rolle und Raummaß) reduziert sind
  und der Vergleichspreis im Shop steht – sonst ohne `preisAlt`.
- Ende der Aktion aus dem Produkt-Metafeld `aktion.ende` in die Zeile („Nur bis
  18.10.“) und der Termin muss davor liegen.
- Den Teppich nach Maß nur zeigen, nicht mit Preis bewerben, wenn er nicht in
  derselben Aktion ist.

Angebote gibt das System nie automatisch frei – sie warten auf den Inhaber.

### 3c. Produkt-Reels (Inhaberentscheidung 16.10.2026)

Bis zu zwei je Woche, nicht am selben Tag wie ein anderes Produkt-Reel. Bewegung
nur durch einen langsamen Zoom auf einem scharfen Shop-Bild – KI-Videos verformen
den Boden und sind verworfen. Kein KI-Hinweis im Bild.

1. Kandidaten: `npm run -s social -- reel-kandidaten --json > "$T"` – je Serie ein
   Produkt ohne Aktion und Auslauf, mit einem Raumbild, das laut Bildrechte-Liste
   auch für Werbung freigegeben ist (lange Kante ab 2000 px), echte Fotos zuerst.
   `vorlage` ist ein fertiger Auftragsvorschlag; als temporäre JSON-Datei ablegen.
2. Auftrag ergänzen – **nur, was so auf der Produktseite steht**:
   - `zeilen.kicker` (Warengruppe · Bauart), `zeilen.name` (Name mit Farbe, ohne
     Maße), `zeilen.merkmale` (zwei, drei Angaben mit „·“), bei Rollenware
     `zeilen.preis_zusatz` etwa „400 cm breit, Länge nach Wunsch“.
   - Jede Angabe wörtlich unter `belege`. Das System bricht ab, wenn ein Beleg
     auf der Live-Seite fehlt oder ein Eurobetrag nicht belegt ist.
   - Preise setzt der Vorschlag: Paketware mit Quadratmeterpreis groß und
     Paketpreis darunter, sonst Euro je m². `varianten`: die Variante, deren Farbe
     das Bild zeigt, mit ihrem Preis („44,90“).
   - Keine Prozente, kein „statt“, kein UVP – Angebote laufen über 3b.
3. `npm run -s social -- reel-vorschau <auftrag.json>` und die Bilder **ansehen**.
   `…-vorschau-ausschnitt.jpg` zeigt Start (grün), Zoom-Ende (gelb),
   Produktfläche (rot) und Anker (weiß): Der Boden soll den Kasten tragen, die
   Produktfläche liegt nur auf Boden (keine Möbel, kein Teppich darauf), der Anker
   mitten im Boden. Bei Bedarf `ausschnitt` (4:5), `anker`, `produktflaeche`
   anpassen und noch einmal ansehen.
4. **KI-bearbeitete oder umgefärbte Raumbilder** (`echtesFoto: false`, Feld
   `ki_abgleich` im Vorschlag): erst das echte Musterfoto derselben Farbe
   danebenlegen – Struktur (Schlinge, Velours, Maserung) und Farbton müssen
   stimmen. Ergebnis in einem Satz in `ki_abgleich`. Passt es nicht: kein Reel,
   im Bericht nennen (Juniva 16.10.: das KI-Kettelbild zeigte Noppen statt feiner
   Schlingen). Solche Reels gibt immer der Inhaber frei.
5. Bildunterschrift als Datei: was zu sehen ist, ein Fachdetail, das kostenlose
   Muster – **ohne Preis** (der steht im Video und wird geprüft). Dann
   `npm run -s social -- produkt-reel <auftrag.json> --text-datei <pfad>`.
   Der Befehl prüft live, rendert (rund eine Minute), misst die Schärfe und legt
   das Reel in die Freigabe; bricht er ab, nennt er den Grund.
6. Prüfblatt (`pruefblatt.jpg`) und Video ansehen: Reel und Standbild gleich
   scharf, alle Texte vollständig lesbar. Sonst `verwerfen <beitragId>`.

Reels mit echtem Foto gibt das System selbst frei. Direkt vor dem Posten prüft
der Publisher Preis und Angaben noch einmal live; weicht etwas ab oder ist der
Preisstand älter als 21 Tage, geht das Reel zurück in die Freigabe – dann neu
bauen, nicht freigeben.

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

Dazu: Produkt-Reels (Nummern, Schärfewerte, automatisch freigegeben oder nicht),
der Stand der Highlights und was der Inhaber dort einsortieren soll
(`highlights-stand`).
Am Ende kurz: wie viele Bilder gesichtet, wie viele mit Bedenken (und warum),
welche Entwürfe entstanden sind, was liegen blieb. `npm run -s social -- status`
zeigt den Stand.

## Montags zusätzlich: Wochenblick

`npm run -s social -- kennzahlen` ausführen und die Erkenntnisse lesen. Dazu
über den Shopify-Connector die Sitzungen der letzten sieben Tage mit
`utm_medium=social` abfragen (nach `utm_content` – das ist die Beitragsnummer)
und in zwei, drei Sätzen festhalten, welche Beiträge Besucher in den Shop
gebracht haben. Keine Empfehlung ohne Zahl dahinter.

## Montags zusätzlich: Highlights zählen

Unter dem Profil stehen fünf Highlights (Verlegung, Referenzen, Im Laden, Muster,
Bewertungen). Die Graph-API kann sie weder lesen noch füllen – eine Story kommt
nur in der Instagram-App in ein Highlight. Deshalb:

1. `instagram.com/teppich.paradies` im angemeldeten Chrome öffnen (nur ansehen)
   und je Highlight die Storys zählen, **einschließlich Titelbild** – die Striche
   des Fortschrittsbalkens oben. Eine 1 heißt: nur das Titelbild, also leer.
2. Eintragen:
   `npm run -s social -- highlights-stand Verlegung=3 Referenzen=1 "Im Laden=1" Muster=1 Bewertungen=1`
3. Der Befehl nennt je Bereich, was fehlt:
   - **Storys zum Einsortieren** – erschienene Storys, die passen. Das ist eine
     Aufgabe für den Inhaber (steht auch in `status`); im Bericht wörtlich
     weitergeben. Stecken sie schon im Highlight: `highlights-stand --einsortiert 57,58`.
   - **Story fehlt** – für einen leeren Bereich ohne passende Story eine bauen:
     - Referenzen, Verlegung: `entwurf <id> --format story` aus einer Referenz
       bzw. einer gesichteten Baustelle.
     - Muster: `wissen-anlegen --titel "So kommen Sie an Muster" --bereich Muster`,
       dann `entwurf <id> --format story --bauplan <plan.json>` mit Vorlage `tipp`
       (bis zu drei Schritte, nur so, wie der Shop den Musterweg beschreibt).
     - Bewertungen: nur echte Google-Bewertungen, Wortlaut unverändert (kürzen nur
       mit „…“), ohne Namen – `wissen-anlegen --bereich Bewertungen`, Vorlage `tipp`
       (Kicker „Kundenstimme“, Titel = Zitat, Text „Google-Bewertung, 5 Sterne“).
     - Im Laden: dafür fehlen Fotos aus dem Laden – im Bericht als Aufgabe für
       den Inhaber nennen (Upload-Link oder WhatsApp-Gruppe, Quelle Laden).
   - Gehört ein Inhalt in einen anderen Bereich: `inhalt <id> --bereich Referenzen`.

Storys aus `wissen-anlegen` gibt der Inhaber frei.

## Grenzen

- Nicht freigeben, nicht veröffentlichen, keine Zugänge anlegen.
- Keine Dateien im Repository ablegen; Texte und Baupläne als temporäre Dateien.
- Nichts an Meta-Konten, Shop oder Theme ändern. Instagram im Chrome nur ansehen –
  keine Highlights bearbeiten, nichts liken, nichts posten.
