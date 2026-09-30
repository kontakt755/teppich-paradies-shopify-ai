# Designsystem für Instagram und Facebook

Eine Bildsprache für alle Beiträge – abgeleitet aus dem Shop, damit Website,
Laden und Social Media wie ein Betrieb aussehen. Umgesetzt als HTML-Vorlagen in
`lib/vorlagen.mjs`; gerendert wird mit Headless-Chrome (`lib/rendern.mjs`).

## Grundsätze

1. **Das Bild trägt den Beitrag.** Text im Bild nur, wo er etwas sagt, das das
   Bild nicht sagen kann: ein Farbname, „Vorher", ein Preis.
2. **Baustellenfotos bleiben echt.** Zuschnitt, kleine Signatur, höchstens
   10 % Helligkeit. Keine Sättigung, kein Farbton, keine KI – die Bodenfarbe
   muss stimmen, sonst ist die Referenz keine.
3. **Ruhe vor Lautstärke.** Eine Schrift, zwei Farben, viel Fläche. Keine
   Sticker, keine Verläufe, keine Ausrufezeichen.
4. **Wiederverwendbar.** Jede Vorlage ist eine Funktion: Daten hinein, Bild
   heraus. Eine Änderung am Design ist eine Zeile CSS an einer Stelle.

## Bausteine

| | Wert | Herkunft |
|---|---|---|
| Schrift | Inter 400 / 500 / 700 | Shop (`--font-body--family`) |
| Rot | `#b0303f` | `--tp-red` – Kicker, Trennlinie, „Nachher", Abzeichen |
| Tinte | `#1d1a17` / `#4a443f` | `--tp-ink`, `--tp-ink-2` – Text |
| Sand | `#f6f2ec` / `#ede7de` | `--tp-bg-2`, `--tp-bg-3` – Flächen |
| Linie | `#e6e0d8` | `--tp-line` |
| Radius | 12–16 px | `--tp-r`, `--tp-r-lg` |
| Logo | Shop-Logo, als Signatur unten links oder auf weißem Feld oben links | Shop |

Formate: **Beitrag und Karussell 1080 × 1350** (4:5 – nimmt im Feed den meisten
Platz ein), **Story und Reel 1080 × 1920** (9:16), Quadrat 1080 × 1080 für
Sonderfälle.

## Vorlagen

| Vorlage | Wofür | Aufbau |
|---|---|---|
| `foto` | Baustelle, Kundenprojekt, Referenz, Einblick | Foto bildfüllend; unten links die Signatur mit einer Zeile („Oranienburg · Klebevinyl"). Folgebilder eines Karussells ganz ohne Signatur. |
| `vorher_nachher` | Vorher/Nachher | zwei Fotos übereinander, „Vorher" dunkel, „Nachher" rot |
| `produkt` | Neu im Shop, Produkt der Woche, Wohnidee, Angebot | Bild oben, darunter Sandfeld mit roter Linie: Kicker, Name, eine Zeile; rechts optional der Quadratmeterpreis; beim Angebot ein rundes Abzeichen |
| `farben_titel` | Titelbild einer Farb- oder Dekorvorstellung | Raster aus bis zu sechs Farbflächen, darunter Name und Anzahl |
| `farbe` | einzelne Farbe im Karussell | Bild bildfüllend, unten links der Farbname, darüber „3 / 9" |
| `tipp` | Bodenwissen, Hinweise | die einzige Textvorlage: Kicker, Frage, bis zu drei nummerierte Punkte |
| `story_foto` | Story, Reel-Standbild | Foto bildfüllend, oben Logo und Marke („Von uns verlegt"), unten eine Zeile; die Bedienflächen von Instagram bleiben frei |

Welche Inhaltsart welche Vorlage bekommt, legt `standardBauplan` in
`lib/werkstatt.mjs` fest; die Redaktion kann je Beitrag davon abweichen.

## Text zum Bild

Ton, Aufbau und Verbotsliste stehen in `lib/texte.mjs` (`STILREGELN`) und
werden vor jedem Entwurf geprüft. Kurz: sagen, was gemacht wurde; Sie-Form;
Ort nur, wenn bekannt; Preise nur je Quadratmeter; keine Floskeln.

## Ändern

- Farbe oder Schrift: `FARBEN` bzw. `SCHRIFT` in `lib/vorlagen.mjs`.
- Neue Vorlage: Funktion `vName(daten, format)` schreiben, in `VORLAGEN`
  eintragen, in `tests/werkstatt.test.mjs` abdecken.
- Probe ohne Beitrag: `baue('produkt', {...}, 'feed')` und `rendere([...])`.
