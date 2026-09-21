# Hauptmenue – Vorlage fuer den Ratgeber-Unterpunkt

Stand 2026-09-21. Entwurf, **nichts ausgefuehrt** – kein `menuUpdate`, keine Seiten angelegt.
Vorlage fuer eine spaetere Sitzung mit Schreibzugriff. Grundregeln siehe `CLAUDE.md` Punkt 6b
und `docs/lessons/tote-menuelinks.md`: `menuUpdate` ersetzt den **gesamten** Item-Baum, nie nur
einen Zweig senden.

## Ziel

Unter dem Oberpunkt „Service & Verlegung“ einen neuen Unterpunkt „Ratgeber“ einhaengen, der auf
die Hub-Seite (`templates/page.ratgeber-uebersicht.json`) zeigt. Die Artikel selbst haengen nicht
einzeln im Hauptmenue – sie werden von der Hub-Seite und von den Cluster-Linklisten (Setting
`menu` je Cluster-Block in `tp-ratgeber-uebersicht.liquid`) erreicht, plus vom Fuss jedes
Artikels (`weitere_menu` in `tp-ratgeber-artikel.liquid`).

## Voraussetzung: Theme live

Vor dem Menue-Schritt muessen die Template-Dateien im Live-Theme stehen, sonst zeigt der neue
Link eine falsche Seite:

- `sections/tp-ratgeber-artikel.liquid`, `sections/tp-ratgeber-uebersicht.liquid`
- `templates/page.ratgeber.json`, `templates/page.ratgeber-uebersicht.json`

**Warnung (siehe `docs/lessons/` zum `page`-Template-Suffix):** Eine Shopify-Seite mit
`templateSuffix: "ratgeber"`, aber ohne deployte `templates/page.ratgeber.json` im
veroeffentlichten Theme, faellt still auf `templates/page.json` zurueck – das ist dieselbe
Falle, die frueher die B2B-Seite unter `/pages/liefer-verlegeservice` ausgeliefert hat (siehe
`shopify_page_template_suffix_fallback` in der Memory / `verlegeservice-livegang-vorlage.md`,
Abschnitt „Reihenfolge“, Punkt 2). Also: erst Theme-Livegang, dann Seiten anlegen, dann Menue.

## Schrittfolge

1. **Theme live stellen** (Deploy-Kette aus `CLAUDE.md`, nur auf ausdrueckliches „deploy“).
2. **Seiten anlegen** – eine je Artikel plus die Hub-Seite, jeweils mit passendem
   `templateSuffix`:
   - Hub-Seite: Handle z. B. `ratgeber`, `templateSuffix: "ratgeber-uebersicht"`.
   - Je Artikel: Handle aus der Tabelle in `ratgeber-informationsarchitektur.md`
     (z. B. `ratgeber-teppichboden-ausmessen`), `templateSuffix: "ratgeber"`.
   - Nach dem Anlegen gegenpruefen: Seite per `curl` abrufen, H1 und Section-Klasse
     (`shopify-section--tp-ratgeber-artikel` bzw. `-uebersicht`) muessen im HTML stehen –
     `userErrors: []` allein ist kein Beleg (Grundregel aus `CLAUDE.md` Punkt 7/6b).
3. **Menue auslesen** (aktueller Stand von `main-menu`, nicht aus einer Doku uebernehmen):

   ```graphql
   query { menu(handle: "main-menu") {
     id handle items { id title type url resourceId
       items { id title type url resourceId items { id title type url resourceId } } } } }
   ```

4. **Neuen Unterpunkt einfuegen** – im Zweig „Service & Verlegung“ einen Eintrag „Ratgeber“
   ergaenzen, der auf die Hub-Seite zeigt (`resourceId` der Page oder relative `url`). Alle
   anderen Zweige unveraendert mit ihren vorhandenen MenuItem-IDs zurueckschreiben (IDs auf
   bestehenden Items mitsenden, nur der neue Eintrag bleibt ohne `id`).
5. **`menuUpdate`** mit dem vollstaendigen Baum:

   ```graphql
   mutation MenuRatgeber($id: ID!, $title: String!, $handle: String, $items: [MenuItemUpdateInput!]!) {
     menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
       menu { id handle items { id title type url resourceId items { id title type url resourceId items { id title url } } } }
       userErrors { field message code }
     }
   }
   ```

6. **Gegenprobe** – alle bisherigen MenuItem-IDs sind noch vorhanden, genau eine ist neu
   (der Ratgeber-Eintrag). Menge der IDs vorher/nachher vergleichen, nicht nur `userErrors`.
7. **`npm run menu:guard`** laufen lassen – findet tote Links auf leeres Raster oder ins Nichts.

## Spaeter: Cluster- und Fuss-Linklisten

Sobald mehrere Artikel je Cluster stehen, je Cluster ein eigenes Menue (nicht das Hauptmenue)
anlegen und als `menu`-Setting am Cluster-Block bzw. `weitere_menu`-Setting am Artikel
hinterlegen – dieselbe `menuUpdate`-Regel gilt dort ebenso (ganzer Baum, IDs pruefen), nur dass
diese Menues nicht im Hauptmenue sichtbar sind und daher kein Mobilmenue-Risiko wie in
`docs/lessons/tote-menuelinks.md` (Abschnitt „ohne ihn waere die Seite am Telefon nicht
erreichbar“) tragen – trotzdem separat mit `menu:guard` pruefen.

## Nicht Teil dieser Vorlage

Keine Aussage zu Preisen, Rabatten oder Rechtstexten. Keine Aenderung an bestehenden Menuepunkten
ausser dem einen neuen Unterpunkt. Keine SEO-Texte fuer die neuen Seiten – die folgen erst, wenn
echte Artikeltexte stehen (nicht Platzhalter).
