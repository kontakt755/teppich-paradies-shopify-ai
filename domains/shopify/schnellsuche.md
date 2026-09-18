# Schnellsuche (Predictive Search) - Aufbau und Pflege

Stand 2026-09-14. Die grosse Suchleiste unter dem Header
(`sections/tp-header-suche.liquid`) zeigt ab zwei Zeichen Vorschlaege,
Produkte und Kategorien, ohne Enter und ohne Seitenwechsel.

## Bauteile

| Datei | Aufgabe |
|---|---|
| `snippets/tp-suche-ergebnisse.liquid` | **einzige Quelle des Ergebnis-Markups**: Vorschlaege, Produkte (Bild, Titel, Typ, Farbanzahl, Preis ueber `snippets/price.liquid`), Kategorien, Ratgeber-Seiten, Leerzustand, Link zur Ergebnisseite; dazu die Optik (`{% stylesheet %}`) |
| `sections/predictive-search.liquid` | Horizon-Section, die Shopify ueber die Section Rendering API zu `/search/suggest` rendert; ruft bei einer Suche das Snippet auf |
| `assets/tp-suche.js` | Custom Element `tp-suche-leiste` fuer das Dropdown am Desktop: Entprellen (150 ms), Mindestlaenge 2, AbortController plus laufende Nummer, Cache je Seite (50 Begriffe), Combobox-ARIA, Pfeiltasten/Enter/Escape/Home/End, Klick ausserhalb, Hervorhebung des Suchbegriffs, "Meinten Sie", Ereignisse fuer Tracking |
| `sections/tp-header-suche.liquid` | Suchfeld, Dropdown-Rahmen, Startinhalte (beliebte Bereiche = Kategorie-Bloecke, "Haeufig gesucht" und "Meinten Sie" aus den Einstellungen) |
| `snippets/search-modal.liquid` | Horizon-Suchfenster (Lupe im Header, Telefon): zeigt dieselben Ergebnisse; der eigene "Alle anzeigen"-Knopf ist aus, weil das Snippet den Link mitbringt |

Am Telefon (bis 767 px) oeffnet das Suchfeld weiterhin das Horizon-Suchfenster:
dort sind klebendes Eingabefeld, Bildschirmtastatur, Scrollen und Schliessen
bereits geloest. Desktop-Dropdown und Fenster teilen sich Markup und CSS.

## Datenquelle

Ausschliesslich Shopify Predictive Search (`routes.predictive_search_url`,
`resources[type]=product,collection,query,page`, `limit_scope=each`,
`unavailable_products=last`). Keine App, keine eigene Indexdatei.

- **Produkte**: nur aktive, im Online Store veroeffentlichte Produkte.
  Entwuerfe, archivierte und "Unlisted" (Kettelservice, Muster,
  Testprodukte) liefert Shopify nicht; das Snippet filtert zusaetzlich
  Tags `nicht-veroeffentlichen`, `Supplier-Draft` und Typ `Service`.
- **Ausgabe je Produkt**: Titel, Produkttyp, Anzahl der Farbwerte, Preis
  (€/m² bzw. "ab", wie auf der Produktkarte), Verfuegbarkeit, Bild, URL.
  Keine Tags, Metafelder, Hersteller oder SKUs - Lieferantendaten bleiben
  intern.
- **Kategorien**: Kollektionen, die Shopify zum Begriff findet, plus die
  Kollektionen der gefundenen Produkte. So erscheint bei "sockel" die
  Kategorie Bodenleisten, obwohl ihr Titel den Begriff nicht enthaelt.
  Ausgeschlossen: `all`, `frontpage`, Handles mit `test`.
- **Suchvorschlaege**: Shopifys `queries`-Ressource (deutsch, ohne
  Dubletten, max. 5).
- **Tippfehler**: Shopify sucht unscharf ("teppichbden", "vinly",
  "klickvynil" liefern Treffer). Ohne Treffer zeigt der Leerzustand die
  fuenf Hauptbereiche und die Telefonnummer.

## Synonyme

Zwei Ebenen:

1. **"Meinten Sie"** (Theme, sofort wirksam): Einstellung der Section
   "TP Suche + Kategorien" im Theme-Editor, eine Zeile je Regel
   `kundenbegriff, weiterer begriff: Shop-Begriff, zweiter Shop-Begriff`.
   Erzeugt Chips ueber den Ergebnissen, aendert die Treffer selbst nicht.
   Vorbelegt: Fussleiste/Bodenleiste -> Sockelleiste, PVC/CV-Belag ->
   Vinyl von der Rolle, Auslegware -> Teppichboden, Designboden ->
   Klickvinyl und Klebevinyl, Laminat -> Klickvinyl.
2. **Search & Discovery** (Shopify-App, aendert die Treffer): Admin ->
   Apps -> Search & Discovery -> Suche -> Synonymgruppen. Nur ueber die
   App-Oberflaeche, keine API. Empfohlene Gruppen:
   - Sockelleiste, Fussleiste, Bodenleiste, Teppichleiste
   - Vinyl von der Rolle, PVC, CV-Belag, PVC-Boden
   - Teppichboden, Auslegware, Auslegeware
   - Designboden, Designbelag, Vinylboden
   Nicht zusammenlegen: Klickvinyl und Klebevinyl (verschiedene Produkte).

## Tracking

`assets/tp-suche.js` loest auf `document` aus, ohne Cookies oder Analytics:

- `tp:suche` mit `detail = { begriff, produkte, treffer }` nach jedem
  geladenen Ergebnis (`treffer: false` = keine Treffer)
- `tp:suche:klick` mit `detail = { begriff, typ, url, text }` bei Klick auf
  Vorschlag (`vorschlag`), Produkt (`produkt`), Kategorie (`kategorie`),
  Seite (`seite`), "Alle Ergebnisse" (`alle`), Startinhalt (`bereich`,
  `beliebt`) oder "Meinten Sie" (`meinten`)

Ein Consent-gesteuertes Analytics kann diese Ereignisse abonnieren.

## Pruefen

Laufzeittest nur im Browser gegen ein Dev-Theme
(`shopify theme push --development --development-context <branch>`), siehe
`reference-dev-theme-render-test`. Shopifys Bot-Schutz sperrt nach vielen
Puppeteer-Seitenaufrufen die IP fuer einige Minuten (HTTP 429, "Deine
Verbindung muss verifiziert werden"); dann warten, nicht umgehen.
