# Menüpunkt „Unsere Arbeit“ – Vorlage für den Livegang

**Nicht vor dem Livegang der Galerie ausführen.** Live hat `/pages/unsere-arbeit`
keine eigene Vorlage und zeigt die B2B-Rückfallseite. Ein Menüpunkt dorthin würde
genau den Fehler erzeugen, den #184 behebt.

## Stand bis dahin

- Menü-Kopie `hauptmenue-entwurf-konzept-c` („Hauptmenü – Entwurf Konzept C (nicht live)“)
  = Hauptmenü mit Stand 2026-09-11 plus „Unsere Arbeit“ unter „Service & Verlegung“,
  vor „Für Firmenkunden“, Typ PAGE auf `gid://shopify/Page/146627592526`.
- Nur das Entwurfs-Theme zeigt die Kopie: `sections/header-group.json`, Block `header-menu`,
  Setting `menu`. Dazu zwei Bildkacheln im selben Block (siehe unten).
- `main-menu` ist unverändert.

## Beim Livegang

1. `main-menu` **vorher komplett auslesen** – seit 2026-09-11 kann sich der Baum geändert haben.
2. `menuUpdate` ersetzt den **gesamten** Baum. Alle vorhandenen Einträge mit ihrer `id`
   zurückschreiben, nur den neuen Punkt ohne `id` ergänzen:
   ```json
   { "title": "Unsere Arbeit", "type": "PAGE", "resourceId": "gid://shopify/Page/146627592526", "items": [] }
   ```
   Position: unter „Service & Verlegung“ (`gid://shopify/MenuItem/734281072974`), vor
   „Für Firmenkunden“ (`gid://shopify/MenuItem/859123056974`).
3. Gegenprobe: Menge der MenuItem-IDs vorher = nachher, plus genau ein neuer Eintrag.
   `userErrors: []` ist kein Beleg (CLAUDE.md 6b).
4. Im Header des Live-Themes `menu` wieder auf `main-menu` stellen und **beide Kacheln
   mitnehmen** (siehe „Bildkacheln“). Sie liegen in `sections/header-group.json` des jeweiligen
   Themes, ziehen also **nicht** automatisch mit um. Ohne sie zeigt das Mega-Menü einen grauen
   Platzhalter, im Handy-Menü fehlt das Bild ganz.
5. Menü-Kopie `hauptmenue-entwurf-konzept-c` erst löschen, wenn kein Theme sie mehr nutzt
   (Löschen nur nach Freigabe).

## Bildkacheln (Blöcke in `sections/header-group.json`, Block `header-menu`)

Beide sind bereits im Entwurf 204100600142 vorhanden. `tp_kachel_service_liefer` ist wertgleich
mit dem Theme „Qualitaet Arbeitskopie 2026-09-11“ – beim Zusammenführen darf keine der beiden
Fassungen die andere überschreiben.

```json
"tp_kachel_service_liefer": {
  "type": "_tp-menu-kachel",
  "settings": {
    "menu_match": "Liefer- & Verlegeservice",
    "image": "shopify://shop_images/20231129_114941.jpg",
    "subtitle": "Lieferung, Verlegung & Preise"
  }
},
"tp_kachel_service_arbeit": {
  "type": "_tp-menu-kachel",
  "settings": {
    "menu_match": "Unsere Arbeit",
    "image": "shopify://shop_images/5e604b3d-3659-4a43-8ab5-ff5b1b738a4e.jpg",
    "subtitle": "Echte Projekte aus der Region"
  }
}
```

In `block_order` gehört `tp_kachel_service_liefer` vor `tp_kachel_service_teppich` und
`tp_kachel_service_arbeit` zwischen `tp_kachel_service_treppen` und `tp_kachel_service_firmen`.
Die Zuordnung läuft über `menu_match`, also über den Titel des Menüpunkts – wird der Titel im
Menü geändert, verliert die Kachel ihr Ziel.

## ID-Stand von `main-menu` am 2026-09-11 (zur Gegenprobe)

Oberste Ebene: 730052297038, 859123319118, 868188684622, 859123089742, 868583539022,
734281072974, 734280614222 · Service & Verlegung: 870444007758, 859122958670, 859122991438,
859123024206, 859123056974 · 41 Einträge insgesamt.
