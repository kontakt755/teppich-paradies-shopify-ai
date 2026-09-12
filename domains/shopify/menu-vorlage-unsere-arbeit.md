# Menüpunkt „Unsere Arbeit“ – ausgeführt am 2026-09-12

> **Erledigt.** Der Menüpunkt steht im Hauptmenü: `gid://shopify/MenuItem/870673121614`,
> Typ PAGE auf `gid://shopify/Page/146627592526`, unter „Service & Verlegung“ zwischen
> „Treppen professionell belegen“ und „Für Firmenkunden“. Ausgeführt per `menuUpdate`
> nach ausdrücklicher Freigabe des Inhabers, Antwort `userErrors: []`.
> Gegenprobe durch erneutes Auslesen: **41 bestehende MenuItem-IDs unverändert, ein
> neuer Eintrag, 42 gesamt.** Zusätzlich unabhängig gegengeprüft von der Sitzung
> „Teppich Paradies Shop auf 99+/100“ (Megamenü Desktop und Drawer mit `tap()`).
>
> Der folgende Ablauf bleibt als Vorlage stehen – für den Fall, dass das Menü neu
> aufgebaut werden muss oder der Punkt in ein weiteres Menü soll.

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
4. Im Header prüfen, dass `menu` auf `main-menu` steht – im Repository ist das der Fall,
   nur das Entwurfs-Theme 204100600142 zeigt auf die Kopie. **Achtung:** Die Menüwahl steckt
   im selben Block wie die Bildkacheln; ein `--only`-Push von `sections/header-group.json`
   in ein fremdes Theme ändert sie mit. Vorher beide Fassungen über die Admin API vergleichen.
   Die Kacheln selbst kommen mit dem Deployment mit.
5. Menü-Kopie `hauptmenue-entwurf-konzept-c` erst löschen, wenn kein Theme sie mehr nutzt
   (Löschen nur nach Freigabe).

## Bildkacheln (`sections/header-group.json`)

Ziel sind **`sections.header_section.blocks` und `sections.header_section.block_order`** –
also direkte Blöcke der Header-Section, **nicht** verschachtelt unter `header-menu`.
`sections/header.liquid` sammelt sie über `content_for 'blocks'`; verschachtelte Kacheln
würden dort nie ausgegeben, das Menü bliebe ohne Bilder.

Beide Kacheln liegen seit 2026-09-12 im Repository (ecb3126, c62489b) und werden mit dem
Deployment übertragen – sie müssen also **nicht** von Hand nachgezogen werden. Von Hand
nachzuziehen ist nur der Menüpunkt selbst (siehe oben).

`tp_kachel_service_liefer` ist wertgleich mit dem Theme „Qualitaet Arbeitskopie 2026-09-11“ –
beim Zusammenführen darf keine der beiden Fassungen die andere überschreiben.

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
