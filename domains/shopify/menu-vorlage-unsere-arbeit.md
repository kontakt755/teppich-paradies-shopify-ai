# Menüpunkt „Unsere Arbeit“ im Hauptmenü

## Stand: erledigt am 2026-09-12

Der Menüpunkt ist gesetzt und live:

| | |
|---|---|
| Eintrag | `gid://shopify/MenuItem/870673121614` |
| Titel | Unsere Arbeit |
| Typ / Ziel | PAGE auf `gid://shopify/Page/146627592526` → `/pages/unsere-arbeit` |
| Position | unter „Service & Verlegung“, zwischen „Treppen professionell belegen“ und „Für Firmenkunden“ |

Ausgeführt per `menuUpdate` nach ausdrücklicher Freigabe des Inhabers, Antwort
`userErrors: []`. Gegenprobe durch erneutes Auslesen: **41 bestehende MenuItem-IDs
unverändert, ein neuer Eintrag, 42 gesamt.** Unabhängig gegengeprüft von der Sitzung
„Teppich Paradies Shop auf 99+/100“ – Megamenü auf dem Desktop und Drawer am Telefon
(mit `tap()`), Klickziel `/pages/unsere-arbeit` mit H1 und 14 Projekten.

> **Nicht erneut ausführen.** `menuUpdate` ersetzt den gesamten Menübaum. Ein zweiter
> Lauf gegen den alten Stand von 41 Einträgen legt entweder einen doppelten Punkt an
> oder schreibt den Baum auf einer falschen Annahme zurück. Der Zielzustand ist erreicht.

## Bildkacheln (`sections/header-group.json`)

Beide Kacheln liegen seit `ecb3126` und `c62489b` im Repository und sind live. Sie werden
mit dem Deployment übertragen – von Hand ist nichts nachzuziehen.

Ziel sind **`sections.header_section.blocks` und `sections.header_section.block_order`** –
also direkte Blöcke der Header-Section, **nicht** verschachtelt unter `header-menu`.
`sections/header.liquid` sammelt sie über `content_for 'blocks'`; verschachtelte Kacheln
würden dort nie ausgegeben, das Menü bliebe ohne Bilder.

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

In `block_order` steht `tp_kachel_service_liefer` vor `tp_kachel_service_teppich` und
`tp_kachel_service_arbeit` zwischen `tp_kachel_service_treppen` und `tp_kachel_service_firmen`.
Die Zuordnung läuft über `menu_match`, also über den Titel des Menüpunkts – **wird der Titel
im Menü geändert, verliert die Kachel ihr Ziel**, ohne Fehlermeldung.

`tp_kachel_service_liefer` ist wertgleich mit dem Theme „Qualitaet Arbeitskopie 2026-09-11“ –
beim Zusammenführen darf keine der beiden Fassungen die andere überschreiben.

**Achtung beim Theme-Push:** Die Menüwahl (`header-menu` → Setting `menu`) steckt im selben
Block wie die Kacheln. Ein `--only`-Push von `sections/header-group.json` in ein fremdes Theme
ändert sie mit. Im Repository steht dort `main-menu`; das Entwurfs-Theme 204100600142 zeigt
auf die Kopie `hauptmenue-entwurf-konzept-c`. Vor einem Push beide Fassungen über die Admin
API vergleichen, nicht raten.

## Menü-Kopie aus der Entwurfsphase

`hauptmenue-entwurf-konzept-c` („Hauptmenü – Entwurf Konzept C (nicht live)“) entstand, als
`/pages/unsere-arbeit` live noch die B2B-Rückfallseite zeigte und ein Punkt im echten Menü
deshalb schädlich gewesen wäre. Seit der Punkt in `main-menu` steht, ist die Kopie
gegenstandslos – löschen aber erst, wenn kein Theme mehr auf sie zeigt, und nur nach Freigabe.

## Nur bei einem echten Neuaufbau

Gilt, wenn das Menü von Grund auf neu entsteht oder der Punkt zusätzlich in ein weiteres Menü
soll. **Für das bestehende `main-menu` ist nichts mehr zu tun.**

1. Das Zielmenü **komplett auslesen**. Der ID-Stand unten ist ein historischer Schnappschuss,
   kein aktueller Bestand.
2. `menuUpdate` ersetzt den **gesamten** Baum. Alle vorhandenen Einträge mit ihrer `id`
   zurückschreiben, den neuen Punkt ohne `id` ergänzen:
   ```json
   { "title": "Unsere Arbeit", "type": "PAGE", "resourceId": "gid://shopify/Page/146627592526", "items": [] }
   ```
3. Gegenprobe über die **Menge der MenuItem-IDs**: alle bisherigen unverändert vorhanden,
   genau ein neuer Eintrag. `userErrors: []` ist kein Beleg (CLAUDE.md 6b).
4. Reihenfolge beachten: Ein Menüpunkt darf erst gesetzt werden, wenn die Zielseite im
   **Live-Theme** eine eigene Vorlage hat. Fehlt sie, fällt Shopify still auf `page.json`
   zurück – genau der Fehler aus #184.

### Historischer ID-Stand vor der Änderung (2026-09-11, 41 Einträge)

Nur zur Nachvollziehbarkeit der Gegenprobe oben – **nicht** als Sollzustand verwenden.

Oberste Ebene: 730052297038, 859123319118, 868188684622, 859123089742, 868583539022,
734281072974, 734280614222 · Service & Verlegung: 870444007758, 859122958670, 859122991438,
859123024206, 859123056974.
