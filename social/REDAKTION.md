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

- Personen (auch Spiegelungen, auch Kinder im Hintergrund), Hände und Arme sind unkritisch
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

### 2. Auswählen

Nicht aus allem wird ein Beitrag. Verwerfen (`inhalt <id> --verwerfen`), wenn
die Bilder nichts zeigen, was jemanden interessiert, oder wenn dasselbe Thema
gerade erst lief. Ziel sind drei bis fünf gute Beiträge je Woche – ein voller
Vorrat für zwei Wochen genügt; mehr Entwürfe als das nur bei frischen
Baustellen.

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
- **Reel** – wenn `reelMoeglich: true` (vorher, Arbeit, nachher vorhanden).

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
