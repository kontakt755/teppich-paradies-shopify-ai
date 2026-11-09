# Hauptmenü-Umbau 2026-10 (Werkbank w-094)

Freigabe des Inhabers am 15.10.2026 (Shopvergleich, Abschnitt „Menü“). Live erst
nach seiner Sichtung des Entwurfs im Arbeitstheme.

## Was sich ändert

**Theme (dieser PR)**

- Desktop-Kopf in zwei Zeilen: oben Logo, Suchfeld (`snippets/tp-kopf-suche.liquid`),
  Warenkorb; darunter das Hauptmenü über die volle Breite. Die Lupe und die
  TP-Suchzeile unter dem Kopf entfallen dort. Ab 1100 px; darunter und auf
  Touch-Geräten bleibt der Kopf einzeilig mit Schubladenmenü.
- Spalten im Mega-Menü (`snippets/tp-menu-spalten.liquid`): Ein Unterpunkt mit
  Link `#` und eigenen Unterpunkten ist eine Spalte. Teppichboden zeigt links
  die Arten als kleine Bildkarten, rechts Farbe (mit Farbpunkten), Raum und
  Rollenbreite. Handy: Arten als Kacheln in zwei Spalten, Spalten als Chips (w-039).
- Handy-Hauptebene: eine Art Unterzeile für alle Punkte, aus der Einstellung
  „Handy-Menü: Unterzeile je Hauptpunkt“ am Menü-Block (`tp_kurztexte`).
- Kontakt steht als Unterpunkt unter „Service & Verlegung“ und behält dort sein
  Telefonsymbol und „Anrufen, WhatsApp, vor Ort“.
- `snippets/tp-menu-link-sichtbar.liquid` blendet nur noch Punkte ohne
  Unterpunkte aus: „Aktuelle Angebote“ verschwindet ohne sichtbares Angebot,
  „Angebote & Reste“ mit „Reste & Sonderposten“ bleibt.

**Shopify-Daten (erst nach `workflow:live`)**

- `main-menu` nach `domains/shopify/menue-umbau-2026-10.json`: 9 Hauptpunkte
  statt 15. Alle 71 bestehenden Punkte bleiben mit ihrer MenuItem-ID, 24 kommen
  dazu (3 Spalten mit 18 Filterlinks, 2 neue Hauptpunkte, „Aktuelle Angebote“).
- Bereits angelegt am 15.10. und im Onlineshop veröffentlicht: automatische
  Kollektionen `laminat-parkett` (Laminat, Parkett, Kork) und
  `linoleum-kautschuk`, Ziel der beiden neuen Hauptpunkte.
- Bereits angelegt: Menü `hauptmenue-entwurf` (Kopie mit neuem Aufbau). Nur das
  Arbeitstheme zeigt darauf; nach dem Livegang löschen.

## Reihenfolge beim Livegang

Erst das Theme, dann das Menü. Das neue Theme läuft mit dem alten Menü
(zwei Zeilen, alte Punkte, „Mehr“ greift); das alte Theme kann die Spalten
(`#`-Punkte) nicht darstellen.

1. PR mergen, `npm run workflow:doctor`, `workflow:preview`, `workflow:live`
   (Skill `deploy`).
2. Direkt danach `main-menu` umbauen:
   - per MCP lesen, drei Ebenen: `menu(id: "gid://shopify/Menu/268032508238")
     { id handle title items { id title type url resourceId tags items { … } } }`,
     Antwort als `vorher.json` speichern.
   - `node scripts/menue-umbau.mjs --alt vorher.json --update update.json` –
     bricht ab, wenn das Menü seit dem 15.10. so geändert wurde, dass der Plan
     nicht mehr passt (dann den Plan anpassen, nicht das Skript).
   - `menuUpdate` mit `id`, `title` und `items` aus `update.json`.
   - wieder lesen als `nachher.json`;
     `node scripts/menue-umbau.mjs --alt vorher.json --pruefen nachher.json`
     muss „verloren 0“ und 24 neue Punkte melden.
   - `npm run menu:guard`, Shop ohne Preview-Parameter bei 1440 und 390 px ansehen.
3. Aufräumen: `hauptmenue-entwurf` löschen (`menuDelete`), im Arbeitstheme
   `sections/header-group.json` per `--only` wieder auf den Stand von `main`.

## Zurück

Erst das Menü, dann das Theme:

```
node scripts/menue-umbau.mjs --alt docs/weiterentwicklung/sicherung/2026-10-15-hauptmenue.json --zurueck zurueck.json
```

`menuUpdate` mit `zurueck.json` stellt den alten Baum mit den alten IDs her; die
24 neuen Punkte fallen weg. Danach den Theme-Stand per Revert-PR zurück.

## Bekannte Grenzen

- „Angebote & Reste“ führt zur Angebotskollektion. Ohne sichtbares Angebot
  fehlt nur der Unterpunkt „Aktuelle Angebote“; der Oberpunkt bleibt wegen
  „Reste & Sonderposten“. Zwischen zwei Aktionen zeigt der Oberpunkt auf die Reste
  (Pläne und Ablauf: `angebote.md`, Abschnitt 6).
- Die Gliederungen `tp-linoleum-nav` (Linoleum-Produkte als Karten) und
  `tp-leisten-nav` (Bodenleisten nach Material und Höhe) greifen nur, wenn
  Linoleum bzw. Bodenleisten Hauptpunkte sind. Nach dem Umbau sind sie
  Unterpunkte und erscheinen als normale Karten. Die Snippets bleiben für den
  Rückweg.
- Filterlinks gezählt am 15.10. in `/collections/teppichboden`; Farben und
  Breiten unter fünf Treffern weggelassen (Weiß, Rosa, Violett, 457 cm).
- Das Konto-Symbol erscheint erst, wenn Kundenkonten im Shop aktiv sind
  (Shop-Einstellung, nicht Teil des Umbaus).

## Messung (Arbeitstheme, 15.10.)

Höhe des geöffneten Mega-Menüs, Inhalt zu verfügbarem Platz. Vorher war das
Teppichboden-Panel bei 1920 × 1080 893 px hoch und ragte bei 1440 × 900 über
den Bildschirmrand.

| Fenster | Teppichboden | höchstes Panel | scrollt |
|---|---|---|---|
| 1280 × 800 | 593 px | 614 px (Vinyl) | nein |
| 1366 × 768 | 615 px | 616 px (Vinyl) | nein |
| 1440 × 900 | 591 px | 617 px (Vinyl) | nein |
| 1920 × 1080 | 750 px | 750 px | nein |

Alle neun Panels ohne Scrollen, keine Konsolenfehler; Menülinks des Entwurfs
(95, davon 29 Filterlinks) ohne leeres Raster.

## Handy-Menue Teppichboden, Variante A (w-179, 2026-10-29)

Inhaber-Entscheidung 28.10.: nur die ersten sechs Arten aus dem Shopify-Menue
als Kacheln (heute Hochflor, Mittelflor, Kurzflor, Velours, Schlinge, Wolle),
alle weiteren als Chips unter "Weitere", Farbe/Raum/Rollenbreite je eine
Chip-Zeile zum Wischen. Gemessen bei 390 x 844: Panel 1232 px (1,46
Bildschirme) -> 912 px (1,08), Rollenbreite beginnt bei 811 px statt 1131 px,
33 Links vorher wie nachher. Fotos:
`bilder/hauptmenue-2026-10/handy-teppichboden-2026-10-29-*.jpg`.
Wer nach vorn soll, wird im Shopify-Menue nach vorn geschoben
(`scripts/menue-umbau.mjs`), kein Theme-Code.

## Teppichboden entschlackt (2026-11-04)

Plan `domains/shopify/menue-teppichboden-2026-11.json` (Inhaber 04.11., Befund in
`sortiment-und-struktur-2026-11.md`): Arten als Kacheln (Hochflor, Velours, Schlinge,
Wolle, Sisal, Nadelfilz; Weitere: Büro & Gewerbe, Kunstrasen), Spalten Preisklasse
(fünf Links auf den Filter „Preis je m²“, gleiche Bündelung wie die Kacheln
`sections/tp-preisklassen.liquid`), Raum (vier) und Marken (Vorwerk, JAB Anstoetz).
33 Links → 20. Entfernt (19 Punkte, im Plan einzeln genannt): Kurz- und Mittelflor
(Filter Florhöhe), „Auch als Teppichfliesen“ (eigener Hauptpunkt), Spalten Farbe und
Rollenbreite (Filter), Raum Arbeitszimmer und Büro. „Auslauf“ steht jetzt unter
Angebote & Reste. Kurz- und Mittelflor-Seiten behalten die Unterkategorie-Leiste über
den Rückfall in `snippets/tp-unterkategorien-leiste.liquid`.

Sicherung vorher: `sicherung/2026-11-04-hauptmenue.json`. Zurück:
`node scripts/menue-umbau.mjs --alt docs/weiterentwicklung/sicherung/2026-11-04-hauptmenue.json --plan domains/shopify/menue-teppichboden-2026-11.json --zurueck zurueck.json`,
dann `menuUpdate` mit `zurueck.json` (entfernte Punkte kommen ohne alte ID zurück).

**Live seit 2026-11-04** (`menuUpdate` per MCP). Gegenprobe aus frischem Lesen: 91 Punkte
= 84 bestehende mit alter ID + 7 neue (Spalten Preisklasse und Marken, fünf Preislinks);
die 19 entfernten IDs fehlen. Treffer der Preislinks über `custom.meterpreis_bereich`
(298 Teppichböden, jede Klasse belegt). `npm run menu:guard` und die Sichtprüfung bei
1440/390 px sind am 09.11. nachgeholt (Abschnitt unten). Bis zum
Theme-Deploy fehlt auf den Seiten Kurz- und Mittelflor die Unterkategorie-Leiste.

## Sichtprüfung Handy/Desktop Teppichboden (2026-11-09, live)

Backlog „Teppichboden Mobile-Menü optimieren“ damit erledigt, ohne weitere Änderung:
Variante A (w-179) und die Entschlackung vom 04.11. sind live und tragen.

- **390 × 844:** Menü → Teppichboden → Art = 3 Tipps (über die Chip-Zeile der
  Startseite 1 Tipp bis zur Kollektion). Teppichboden steht oben in Ebene 1, das
  Teppichboden-Panel passt ganz auf einen Bildschirm (Arten-Kacheln mit Zahl,
  Weitere, Preisklasse, Raum, Marken). Fotos `handy-menue-2026-11-09-ebene1.jpg`,
  `handy-teppichboden-2026-11-09.jpg`.
- **1440 × 900:** Megamenü Teppichboden ohne Scrollen, acht Kacheln plus Spalten
  Preisklasse/Raum/Marken (`desktop-1440-teppichboden-2026-11-09.jpg`).
- **`npm run menu:guard`:** alle Teppichboden-Links ohne Fehler; 23 Treffer nur
  HTTP 429 (Drosselung durch den Shop) bei Zubehör/Laminat/Reste, kein toter Link.
- **Verbleibender Zeitverlust liegt nicht im Menü,** sondern auf `/collections/teppichboden`:
  das erste Produkt beginnt bei 1503 px (Kopf 484, Preisklassen 151, Boden-Finder 224,
  Musterband 358); auf Hochflor bei 1043 px. Das Musterband bleibt bewusst stehen,
  solange die Musterwirkung gemessen wird (Messtermine 26.11./05.12.); danach ist
  „Musterband unter die Produkte“ der naheliegende Schritt (spart 358 px am Handy).

## Restposten und Teppiche nach Zweck (2026-11-04, live)

- `domains/shopify/menue-restposten-2026-11.json`: „Angebote & Reste“ → Sammelkollektion
  `restposten`, darunter „Alle Restposten & Auslauf“, „Restrollen & Reststücke“ und die vier
  Auslauf-Punkte (vorher in Teppichboden/Teppiche/Teppichfliesen/Vinylboden). Gegenprobe: 92 =
  91 alte IDs + 1 neu. Sicherung davor `sicherung/2026-11-04b-hauptmenue.json`.
- `domains/shopify/menue-teppiche-zweck-2026-11.json`: unter „Teppiche in Standardgrößen“
  Kinderteppiche (32), Outdoor-Teppiche (71), Hochflor-Teppiche (42), Waschbare Teppiche (13).
  Gegenprobe: 96 = 92 alte IDs + 4 neu. Sicherung davor `sicherung/2026-11-04c-hauptmenue.json`.
- `domains/shopify/menue-runde-teppiche-2026-11.json`: Runde Teppiche (184, Variante mit „rund“)
  als fünfter Punkt. Gegenprobe: 97 = 96 alte IDs + 1 neu. Sicherung davor `sicherung/2026-11-04d-hauptmenue.json`.
