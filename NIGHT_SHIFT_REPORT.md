# NACHTSCHICHT – Sales / SEO / Google Readiness

Stand: 11. August 2026  
Live-Theme: `201829679438` (`theme-productpage-v2-night`)  
Fallback: `196301750606` – nicht verändert

## A. LIVE GEÄNDERT

| Änderung | Nutzen | Datei | Getestete URL |
|---|---|---|---|
| Native Rollenbreitenwerte für `filter.v.m.custom.rollenbreite` als 200/300/400/500 cm vorbereitet, inklusive aktiver Filter-Chips | Verständliche native Shopify-Filterdarstellung ohne eigene Filterengine | `snippets/list-filter.liquid`, `snippets/filter-remove-buttons.liquid` | Teppichboden, Vinyl von der Rolle, Suche; Filter bleibt bis Admin-Aktivierung dormant |
| Suche von H3 auf genau eine H1 korrigiert; redundante versteckte Homepage-H1 entfernt | Eindeutige Dokumenthierarchie | `sections/search-header.liquid`, `sections/header.liquid` | `/`, `/search?q=teppichboden`, Desktop und 390 px |
| Sechs sichtbare Horizon-Demotexte durch kurze fachliche Kategorieformulierungen ersetzt | Verständlichere Kategorieauswahl ohne Theme-Platzhalter | `templates/collection.teppichboden.json` | `/collections/teppischboden`, Desktop und 390 px |
| Wolle-Kachel auf die bestehende Hauptcollection korrigiert | Konsistenter wichtiger Klickweg | `templates/collection.teppichboden.json` | `/collections/teppischboden` → `/collections/teppichboden-wolle` |
| Bildlinks erhalten serverseitig und als Cache-Absicherung zugängliche Namen | Accessibility und verständlicher Linkzweck | `blocks/image.liquid`, `layout/theme.liquid` | Teppichboden und Untercollections, Desktop und 390 px |
| Footer um kompakte Gruppe „Sortiment“ ergänzt | Direkte interne Verlinkung zu vier Hauptkategorien | `blocks/tp-footer-links.liquid` | Startseite, Collections, PDP, Versandseite |
| Rollenlängenfeld erhält dynamisch `aria-label="Gewünschte Länge in Zentimetern"` | Rechner-Eingabe für Screenreader verständlich, Berechnungslogik unverändert | `layout/theme.liquid` | Rollen-Vinyl-PDP, Desktop und 390 px |

Alle Live-Änderungen gingen ausschließlich auf Theme `201829679438`. Preise, SKUs, GTINs, Produkte, Varianten, Metafelder, Checkout, Versandraten und Fallback-Theme wurden nicht verändert.

## B. NUR ANALYSIERT

| Problem | Priorität | Warum nicht automatisch geändert |
|---|---:|---|
| 12 wichtige Seiten ohne Meta Description | Hoch | Shopify-Resource-Daten; konkrete Texte stehen in `SEO_ADMIN_RECOMMENDATIONS.md` |
| Historischer Handle `/collections/teppischboden` | Mittel | Keine URL-Migration im Nachtlauf; Canonical ist selbstreferenziell, interne Hauptlinks verwenden den aktuellen Handle |
| OPC-Variante im öffentlichen ProductGroup-Markup bei Softiq | Hoch vor Merchant-Freigabe dieses Produkts | Shopifys `structured_data` enthält die echte öffentliche OPC-Variante; ein kompletter Schema-Ersatz wäre riskanter als dokumentierte Feed-Prüfung |
| Fehlende GTIN/EAN in allen vier Merchant-Stichproben; SKU/Produkttyp teilweise leer | Hoch vor Shopping | Produktdaten durften nicht ungefragt verändert werden |
| GA4, Google Ads Purchase, Merchant-Verknüpfung und Meta öffentlich nicht eindeutig erkennbar | Hoch | Customer Events, App-Admin, Werbekonten und echter Purchase wurden bewusst nicht verändert/ausgelöst |
| Eager geladene Bilder weit unter dem Fold, wiederholte Horizon-Scripts und erhöhte Layout-Shift-Messwerte | Mittel | Breite Horizon-/App-Änderung wäre riskant; konsistenter Shift um ca. 0,28 deutet auch auf Consent-/Drittanbieter-UI hin |
| Leere Alt-Texte an mehreren Kategorie-/Contentbildern | Mittel | Linknamen wurden technisch abgesichert; redaktionelle Bild-Alt-Texte sollten mit dem geplanten Foto-Rollout sauber gepflegt werden |
| Warenkorb ohne explizites HTML-/Header-noindex | Niedrig/Mittel | Shopify-Robots-Verhalten nicht mit Theme-Hack überschrieben; im Google-Index/URL-Prüftool kontrollieren |

URL-Empfehlung für `/collections/teppischboden`: **SPÄTER ÄNDERN**. Der aktuelle URL ist live, intern verlinkt, indexierbar und canonical auf sich selbst. Eine spätere Migration nur geplant mit neuem Handle `/collections/teppichboden`, dauerhaftem 301, aktualisierten internen Links, Sitemap-/GSC-Kontrolle und Ranking-Monitoring. Jetzt ändern hätte unnötiges SEO-Risiko erzeugt.

## C. MANUELLER SHOPIFY-SCHRITT

### 1. Rollenbreitenfilter aktivieren (genau ein Search-&-Discovery-Schritt)

1. Shopify Admin → **Apps** → **Shopify Search & Discovery**.
2. **Filter** öffnen → **Filter hinzufügen**.
3. Unter Varianten-Metafeldern **Rollenbreite / `custom.rollenbreite`** auswählen.
4. Speichern.

Danach öffentlich Teppichboden, Teppichboden-Untercollection, Vinyl von der Rolle und Suche prüfen. Erwartet: `200 cm`, `300 cm`, `400 cm`, `500 cm`. Klick-/Klebevinyl zeigen den Filter ohne passende Werte nicht. Keine eigene JavaScript-Filterengine erforderlich.

### 2. SEO-Resource-Felder pflegen

Für Startseite: Shopify Admin → Onlineshop → Konfiguration/Startseiten-SEO.  
Für Collections/Seite: Produkte → Kategorien beziehungsweise Onlineshop → Seiten → jeweilige Resource → **Suchmaschineneintrag bearbeiten**.  
Die geprüften Ist-/Soll-Texte stehen in `SEO_ADMIN_RECOMMENDATIONS.md`. Danach `npm run seo:check` erneut ausführen; die 12 ERROR sollten verschwinden.

## D. GOOGLE / MERCHANT

### READY

- Repräsentative Landingpages liefern HTTP 200.
- Öffentliche Product-/ProductGroup- und Offer-Daten sind syntaktisch valide; Preis, EUR, Verfügbarkeit, URL und Bilder sind vorhanden.
- Sichtbarer Paketpreis und €/m²-Preis sind auf Paket-PDPs nachvollziehbar; Rollenware zeigt den echten €/m²-Preis.
- Versandseite und Versandlinks sind erreichbar.

### NEEDS ATTENTION

- Alle vier geprüften Produkte: keine öffentlich gepflegte GTIN/EAN.
- Softiq: keine SKU, OPC-Variante im öffentlichen Produkt-JSON/Schema.
- Klebevinyl-Stichprobe: Produkttyp und SKU fehlen.
- Paketware: Feedpreis gegen sekundären Paketpreis der Landingpage kontrollieren, damit Google nicht den sichtbaren €/m²-Preis als Verkaufspreis missversteht.
- Rollenware: Feedvarianten und Rollenbreiten gegen die echte Variantenauswahl kontrollieren.
- Der am weitesten vorbereitete erste Werbekandidat der Stichprobe ist Klickvinyl Marlow (Vendor, Produkttyp und SKU vorhanden); GTIN-/Feed- und Paketpreisprüfung bleibt nötig.

### BLOCKER

- Kein öffentlicher mechanischer Produkt-Blocker gefunden.
- Kampagnenstart bleibt organisatorisch blockiert, bis Merchant-Diagnose und Purchase-Tracking nach einem genehmigten Testkauf bestätigt sind.

Detailbericht: `qa/MERCHANT_READINESS_REPORT.md`.

## E. SEO

### Wichtigste 10 Findings

1. Zwölf priorisierte Seiten haben keine Meta Description.
2. Homepage-Title ist mit „TeppichParadies“ zu kurz.
3. Rollen-Vinyl-PDP-Title ist mit 78 Zeichen lang.
4. Softiq-PDP-Meta-Description ist mit 329 Zeichen zu lang.
5. `custom.rollenbreite` ist noch nicht als nativer Filter aktiviert.
6. Softiq ProductGroup enthält eine OPC-generierte Variante.
7. Mehrere Contentbilder haben leere Alt-Texte; Linkzwecke sind inzwischen zugänglich benannt.
8. Viele Produktgrid-Bilder werden weit unterhalb des Folds ohne `loading=lazy` gemessen.
9. Zwei bis drei Horizon-Scripts erscheinen pro Seitentyp mehrfach; nicht ohne Funktionsanalyse entfernen.
10. Automatische Sitemap-/Link-Stichprobe wurde nach vielen Live-Aufrufen zeitweise HTTP-429-limitiert; direkter Baseline-Abruf von Sitemap, robots.txt und kritischen Links war HTTP 200.

### Wichtigste 10 erledigte Punkte

1. Wiederverwendbaren `npm run seo:check` mit Markdown/JSON und Exit-Codes gebaut.
2. Genau eine Homepage-H1 hergestellt.
3. Suche mit echter H1 versehen.
4. Demo-/Platzhaltertexte entfernt.
5. Wolle-Link korrigiert.
6. Bildlinks zugänglich benannt.
7. Footer-Hauptkategorien intern verlinkt.
8. Rechner-Längenfeld zugänglich beschriftet.
9. Produkt-/Offer-/Preis-/Compare-at-/Breadcrumb-/Vergleich-Checks automatisiert und live geprüft.
10. SEO-Admin-Empfehlungen für alle priorisierten Landingpages erstellt.

## F. FILTER

- Rollenbreite aktiv: **Nein** – Search & Discovery liefert den Facet noch nicht.
- Theme-Rendering live vorbereitet: **Ja**.
- Sichtbare Werte nach Aktivierung: **200 cm / 300 cm / 400 cm / 500 cm**.
- Mehrfachwerte bleiben Shopify-native Variant-Metafeldwerte; ein Produkt mit 2 + 4 m kann damit in beiden Filtern erscheinen.
- Notwendiger Admin-Schritt: Abschnitt C.1.
- Paket-Vinyl-Preisfilter bleibt ausgeblendet; Rollenware-Preisfilter bleibt erlaubt.

## G. QA

- Befehl: `npm run qa`
- Finaler Exit-Code: **0**
- Status: **WARN**
- Neue Errors: **0**
- Neue Theme-Check-Warnings: **0**
- Bekannte Baseline: **9 Errors / 35 Warnings**
- Aktuell: **9 Errors / 35 Warnings**
- Live-Matrix: 14 Seitentypen × Desktop/390 px, keine neuen kritischen Console-/Assetfehler, kein horizontaler Overflow, sichtbare Bilder geladen.
- Baseline-Matching ist jetzt robust gegen reine Zeilen-/Spaltenverschiebungen.

## H. SEO CHECK

- Befehl: `npm run seo:check`
- Finaler Exit-Code: **1**
- Errors: **12**, ausschließlich fehlende Meta Descriptions auf Shopify-Resources
- Warnings: **114**, überwiegend Bild-Lazy-Loading/Alt-Texte, Touch-Target-Stichproben, Layout Shift, doppelt eingebundene Horizon-Scripts, Filter-Admin-Hinweis und Rate-Limit-Hinweise
- Technische H1-, JSON-LD-, Product/Offer-, Preis-, doppelte €/m²-, Compare-at-, Versandlink-, sichtbare Broken-Image- und zugängliche Link/Input-Fehler: **0**
- Berichte: `SEO_REPORT.md`, `qa/results/seo-latest.json`, `SEO_ADMIN_RECOMMENDATIONS.md`

## I. MORGEN ALS ERSTES

1. In Search & Discovery `custom.rollenbreite` aktivieren und die vier sichtbaren cm-Werte auf Teppichboden/Rollen-Vinyl testen.
2. Die 12 Meta Descriptions und priorisierten Titles aus `SEO_ADMIN_RECOMMENDATIONS.md` in Shopify eintragen; danach `npm run seo:check` wiederholen.
3. Einen genehmigten vollständigen Testkauf durchführen und gleichzeitig GA4 DebugView, Google Ads Conversion, Shopify Customer Events sowie anschließend Merchant Center Diagnosen prüfen.

## Lokale Automatisierung und Berichte

- `qa/run-seo-check.mjs`, `qa/seo.config.json`, `package.json`
- `qa/run-qa.mjs`, `qa/qa.config.json`, `qa/README.md`
- `SEO_REPORT.md`, `qa/results/seo-latest.json`
- `SEO_ADMIN_RECOMMENDATIONS.md`
- `qa/MERCHANT_READINESS_REPORT.md`
- `qa/TRACKING_READINESS.md`
- `qa/PHOTO_ROLLOUT_CHECKLIST.md`
