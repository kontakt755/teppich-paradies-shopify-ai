# Verlegeservice – Vorlage für den Livegang

Stand 2026-09-11. **Ausgeführt am 2026-09-11:** Theme-Livegang um 18:45Z (Theme-ID siehe
`live-theme.json`), direkt danach Schritt A (Menü, alle 40 IDs erhalten, ein Unterpunkt neu) und
Schritt B (SEO der drei Seiten), live per `curl` gegengeprüft. Nicht erneut ausführen. Offen ist
nur das Aufräumen der Menü-Kopie `hauptmenue-entwurf-verlegeservice` (Entscheidung des Inhabers).

Der Theme-Teil liegt im Branch `feature/verlegeservice-rollenware` (PR #191) und auf der
Arbeitskopie „Qualitaet Arbeitskopie 2026-09-11“. Menü und SEO-Texte sind dagegen
**storeweit**: Ein Schreibzugriff wirkt sofort im Live-Shop, egal welches Theme veröffentlicht
ist. Sie lassen sich deshalb nicht im Entwurf zeigen und stehen hier als fertige Vorlage.

## Reihenfolge

1. Livegang nur auf ausdrückliches „deploy“. Merge-Reihenfolge #174 → #191 → main, dann die
   Deploy-Kette (`npm run workflow:doctor`, `preview`, `live`). Kommt #186 danach:
   `templates/page.verlegeservice.json` aus #191 behalten und die vier Service-Texte in
   `templates/index.json` ersetzen (Wortlaut im PR-Text von #191), sonst schlägt
   `qa/tests/verlegeservice.test.mjs` an.
2. **Erst danach** Menü (A) und SEO (B). Solange das Live-Theme `page.verlegeservice.json`
   nicht hat, zeigt `/pages/liefer-verlegeservice` live die B2B-Rückfallseite – ein Menülink
   dorthin schickte Privatkunden auf die Gewerbeseite, und die neuen SEO-Texte passten nicht
   zum Seiteninhalt.
3. Prüfen (C).

## A. Hauptmenü

Datei: [`menu-main-menu-verlegeservice-vorlage-2026-09-11.json`](menu-main-menu-verlegeservice-vorlage-2026-09-11.json)

| | vorher | nachher |
|---|---|---|
| Oberpunkt „Service & Verlegung“ | `/pages/boden-malerarbeiten` (Gewerbeseite „Boden & Malerarbeiten“) | Seite „Liefer- & Verlegeservice“ |
| Erster Unterpunkt | – | „Liefer- & Verlegeservice“ (neu) |
| Übrige Unterpunkte | Teppichboden verlegen · Vinylboden verlegen · Treppen · Für Firmenkunden | unverändert |

Der neue Unterpunkt ist nötig, weil der Oberpunkt im Mobilmenü nur das Untermenü öffnet – ohne
ihn wäre die Seite am Telefon über das Menü nicht erreichbar.

**Im Entwurf schon zu sehen:** Für die Vorschau gibt es seit 2026-09-11 eine Kopie
„Hauptmenü – Entwurf Verlegeservice (nicht live)“ (Handle `hauptmenue-entwurf-verlegeservice`,
`gid://shopify/Menu/347252130126`) mit genau diesen zwei Änderungen. Nur die Arbeitskopie hängt
daran (ihre `sections/header-group.json`, nicht im Branch) – main und das Live-Theme verweisen
weiter auf `main-menu`, der Livegang ändert daran nichts. Nach Schritt A die Kopie im Admin
entfernen, sonst altert sie neben dem echten Menü.

Das Megamenü der Arbeitskopie (Bildkacheln, Branch `feature/mobile-menue-ux`) holt die
Kartenbilder aus `_tp-menu-kachel`-Blöcken in `sections/header-group.json`. Dort steht dafür
`tp_kachel_service_liefer` (Menüpunkt „Liefer- & Verlegeservice“, Bild `20231129_114941.jpg`)
vor `tp_kachel_service_teppich`. Geht dieses Megamenü live, muss die Kachel mit – ohne sie
zeigt die Karte nur den Anfangsbuchstaben.

1. Menü frisch auslesen (Abfrage wie in `CLAUDE.md`, Punkt 6b) und mit `vorher` in der Datei
   vergleichen. Weicht etwas ab, `variables` aus dem frischen Stand neu erzeugen – nie den
   Stand vom 2026-09-11 über neuere Änderungen schreiben. `menuUpdate` ersetzt den ganzen Baum.
2. `menuUpdate` mit `variables` aus der Datei:

   ```graphql
   mutation MenuVerlegeservice($id: ID!, $title: String!, $handle: String, $items: [MenuItemUpdateInput!]!) {
     menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
       menu { id handle items { id title type url resourceId items { id title type url resourceId items { id title url } } } }
       userErrors { field message code }
     }
   }
   ```

3. Gegenprobe: Alle 40 IDs aus `vorher` sind noch da, genau eine ist neu. `userErrors: []`
   allein ist kein Beleg.

## B. SEO-Texte

Die Texte nennen Schwelle, Radius und Preis. Ändern sich die Werte unter „TP Verlegeservice“ in
den Theme-Einstellungen, müssen sie hier mit – das ist die einzige zweite Stelle.

Der Titel bekommt vom Theme „ – TeppichParadies“ angehängt (`snippets/meta-tags.liquid`).

| Seite | Feld | vorher (live) | nachher |
|---|---|---|---|
| Liefer- & Verlegeservice | Seitentitel | Verlegeservice | Liefer- & Verlegeservice |
| | SEO-Titel | – (leer, fällt auf den Seitentitel) | Liefer- & Verlegeservice: Preise für Teppichboden & Vinyl |
| | Beschreibung | Liefer- und Verlegeservice rund um Oranienburg: bis 15 km Lieferung und lose Verlegung inklusive, ab 649 € Warenwert alles inklusive, regulär bis 50 km. **– falsch: „bis 15 km inklusive“ ohne Schwelle, „alles inklusive“** | Teppichboden & Vinyl von der Rolle geliefert und verlegt: ab 649 € Warenwert bis 15 km Lieferung und lose Verlegung kostenlos, sonst Festpreise ab 39 €. |
| Teppichboden verlegen lassen | Beschreibung | … Im Umkreis von 15 km sind Lieferung und lose Verlegung inklusive. **– falsch: ohne Schwelle** | Teppichboden verlegen lassen in Oranienburg: Aufmaß, Lieferung und Verlegung vom Fachgeschäft – ab 649 € bis 15 km Lieferung und lose Verlegung kostenlos. |
| Vinylboden verlegen (optional) | Beschreibung | … Klick- und Klebevinyl vom Fachhandel … bis 50 km Umkreis. | Vinylboden verlegen lassen in Oranienburg: Klick-, Klebe- und Rollenvinyl vom Fachhandel – Aufmaß, Untergrund und Verlegung aus einer Hand, bis 50 km. |

Längen: SEO-Titel 57 Zeichen (mit Anhang 75, Google kürzt nur den Markennamen),
Beschreibungen 150–154 Zeichen.

Mutation, je Seite ein Aufruf, beide Felder zusammen senden:

```graphql
mutation SeoSeite($id: ID!, $page: PageUpdateInput!) {
  pageUpdate(id: $id, page: $page) {
    page { id title seoTitle: metafield(namespace: "global", key: "title_tag") { value } seoDesc: metafield(namespace: "global", key: "description_tag") { value } }
    userErrors { field message code }
  }
}
```

Liefer- & Verlegeservice:

```json
{
  "id": "gid://shopify/Page/145743577422",
  "page": {
    "title": "Liefer- & Verlegeservice",
    "metafields": [
      { "namespace": "global", "key": "title_tag", "type": "single_line_text_field", "value": "Liefer- & Verlegeservice: Preise für Teppichboden & Vinyl" },
      { "namespace": "global", "key": "description_tag", "type": "single_line_text_field", "value": "Teppichboden & Vinyl von der Rolle geliefert und verlegt: ab 649 € Warenwert bis 15 km Lieferung und lose Verlegung kostenlos, sonst Festpreise ab 39 €." }
    ]
  }
}
```

Teppichboden verlegen lassen:

```json
{
  "id": "gid://shopify/Page/150097723726",
  "page": {
    "metafields": [
      { "namespace": "global", "key": "description_tag", "type": "single_line_text_field", "value": "Teppichboden verlegen lassen in Oranienburg: Aufmaß, Lieferung und Verlegung vom Fachgeschäft – ab 649 € bis 15 km Lieferung und lose Verlegung kostenlos." }
    ]
  }
}
```

Vinylboden verlegen (optional):

```json
{
  "id": "gid://shopify/Page/150100934990",
  "page": {
    "metafields": [
      { "namespace": "global", "key": "description_tag", "type": "single_line_text_field", "value": "Vinylboden verlegen lassen in Oranienburg: Klick-, Klebe- und Rollenvinyl vom Fachhandel – Aufmaß, Untergrund und Verlegung aus einer Hand, bis 50 km." }
    ]
  }
}
```

## C. Prüfen

Live nur frisch oder per `curl` messen – nach `?preview_theme_id` zeigt dieselbe
Browsersitzung weiter das Preview.

```bash
curl -s https://www.teppich-paradies.net/pages/liefer-verlegeservice | grep -oE '<title>[^<]*|name="description" content="[^"]*|b2b-hero|<h1[^>]*>[^<]*'
```

Erwartet: neuer Titel und neue Beschreibung, H1 „Teppichboden & Vinyl von der Rolle – …“, kein
`b2b-hero`. Dazu stichprobenartig:

| Produkt | Hinweis „Liefer- & Verlegeservice verfügbar“ | Link „Verlegeservice“ |
|---|---|---|
| Teppichboden (Rolle) | ja | /pages/liefer-verlegeservice |
| Vinyl von der Rolle | ja | /pages/liefer-verlegeservice |
| Klick- / Klebevinyl | nein | /pages/vinylboden-verlegen |
| Linoleum, Teppichfliese, Leiste, Zubehör | nein | /pages/boden-malerarbeiten (wie bisher) |

## Zurück

- SEO: die Werte aus der Spalte „vorher“ mit derselben Mutation schreiben.
- Menü: im Admin den Oberpunkt wieder auf `/pages/boden-malerarbeiten` stellen und den neuen
  Unterpunkt entfernen; der vollständige alte Stand steht in `vorher` der Menü-Datei.
- Vinyl von der Rolle abschalten: in den Theme-Einstellungen „TP Verlegeservice“ →
  „Produkttypen mit Verlegeservice“ auf `Teppichboden` setzen und im Abschnitt der Serviceseite
  den Text des zweiten Knopfs leeren.

## Offen – Entscheidung des Inhabers

- **Linoleum von der Rolle** (9 Produkte, Template `rolle`) ist nicht freigegeben. Freigabe wäre
  eine Zeile: „, Linoleumboden“ an die Produkttypen anhängen.
- Der Link „Verlegeservice“ führt bei Linoleum, Teppichfliesen, Leisten und Zubehör weiter auf die
  Gewerbeseite „Boden & Malerarbeiten“ – unverändert, weil der Rollenware-Service dort nicht gilt.
- Die alte Startseite (`sections/Startseite.liquid`, Knopf „Beratung & Verlegeservice“) zeigt
  ebenfalls auf die Gewerbeseite; die neue Startseite aus #186 ersetzt sie.
