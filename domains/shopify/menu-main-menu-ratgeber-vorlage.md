# Hauptmenue – Vorlage fuer den Ratgeber-Unterpunkt (Blog-Aufbau)

Stand 2026-09-21. **Nichts ausgefuehrt** – kein `menuUpdate`, kein Blog, keine Seite
angelegt. Vorlage fuer die Livegang-Sitzung. Uebernommen aus dem seitenbasierten
Entwurf (PR #424) und an den entschiedenen Blog-Aufbau angepasst (#422, PR #427).
Grundregeln: `CLAUDE.md` Punkt 6b und `docs/lessons/tote-menuelinks.md` –
`menuUpdate` ersetzt den **gesamten** Item-Baum, nie nur einen Zweig senden.

## Ziel

Unter „Service & Verlegung" ein neuer Unterpunkt „Ratgeber", der auf die
Uebersichtsseite `/pages/ratgeber` zeigt. Einzelne Artikel haengen nicht im
Hauptmenue – sie sind ueber Uebersicht → Bereich (Blog) → Themengruppe erreichbar
und ueber „Weitere Ratgeber" am Artikelende.

## Reihenfolge (nicht vertauschen)

1. **Theme live** mit `templates/page.ratgeber-start.json`, `blog.ratgeber.json`,
   `article.ratgeber.json` (Deploy-Kette aus `CLAUDE.md`, nur auf ausdrueckliches
   „deploy"). Eine Seite mit Suffix, dessen Template im Live-Theme fehlt, faellt still
   auf `templates/page.json` zurueck – hier die B2B-Seite.
2. **Blog anlegen:** Handle `ratgeber-teppichboden`, Titel „Teppichboden-Ratgeber",
   `templateSuffix: "ratgeber"`.
3. **Seite anlegen:** Handle `ratgeber`, Titel „Ratgeber", `templateSuffix:
   "ratgeber-start"`. Der Block „Teppichboden" in `page.ratgeber-start.json` zeigt
   bereits auf den Blog-Handle aus Schritt 2.
4. **Artikel** aus `content/ratgeber/teppichboden/` anlegen – erst, wenn
   `grep -c PRUEFEN` je Datei 0 ergibt und der Inhaber freigegeben hat.
   `templateSuffix: "ratgeber"`, Tags und Metafelder aus der jeweiligen `.json`.
5. **Gegenprobe vor dem Menue:** Seite, Blog und einen Artikel per Puppeteer
   abrufen (nicht `curl` mit Vorschau-Cookie): H1 stimmt, im HTML steht
   `tp-rg-`, JSON-LD enthaelt `Article` und `BreadcrumbList`. `userErrors: []`
   ist kein Beleg.
6. **Menue auslesen** (aktueller Stand, nicht aus einer Doku uebernehmen):

   ```graphql
   query { menu(handle: "main-menu") {
     id handle title items { id title type url resourceId
       items { id title type url resourceId items { id title type url resourceId } } } } }
   ```

   Falls `menu(handle:)` im Schema fehlt: `menus(first: 10, query: "handle:main-menu")`.
7. **`menuUpdate`** mit dem vollstaendigen Baum; alle bestehenden Items mit ihrer
   `id` zuruecksenden, nur der neue Eintrag „Ratgeber" im Zweig „Service &
   Verlegung" bleibt ohne `id` (Typ `PAGE` mit `resourceId` der Seite):

   ```graphql
   mutation MenuRatgeber($id: ID!, $title: String!, $handle: String, $items: [MenuItemUpdateInput!]!) {
     menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
       menu { id items { id title url items { id title url items { id title url } } } }
       userErrors { field message code }
     }
   }
   ```

8. **Gegenprobe:** Menge der MenuItem-IDs vorher = nachher plus genau eine neue.
   Danach `npm run menu:guard`. Das Mobilmenue am Handy oeffnen – ein toter Punkt
   sieht im Editor genauso aus wie ein lebender.
9. Den Entwurf `hauptmenue-entwurf-konzept-c` nicht anfassen.

## Nicht Teil dieser Vorlage

Keine weiteren Menuepunkte, keine Fusszeilen-Aenderung („Ueber uns" verlinken ist
eine eigene kleine Aufgabe, siehe `docs/ratgeber/README.md` Abschnitt 5), keine
SEO-Texte fuer Blog und Seite – die kommen mit den freigegebenen Artikeln.
