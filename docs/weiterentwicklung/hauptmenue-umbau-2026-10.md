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
  „Reste & Sonderposten“.
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
