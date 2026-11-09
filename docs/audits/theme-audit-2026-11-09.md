# Theme-Audit 2026-11-09

Zweiter Lauf des Skills `theme-audit`, Schwerpunkt: Seiten, auf denen Kunden
kaufen. Danach wurden die drei Befunde mit dem besten Verhaeltnis von Nutzen zu
Risiko im selben PR umgesetzt (Auftrag der Sitzung; abweichend vom Skill, der
sonst nur liest).

- **Stand:** `main` bei `135e2c24`, Live-Shop am 2026-11-09 zwischen 13:40 und 15:30 UTC
- **Seiten (rohes HTML per curl, Live):** Startseite, `/collections/teppichboden`,
  `/products/piumera-teppichboden-400cm-500cm`, `/collections/teppich-nach-mass`
  (Ziel von `/pages/teppich-nach-mass`, 301), `/collections/reste-sonderposten`;
  dazu zwei Restrollen-Produkte (Rolle und Kettelteppich)
- **Darstellung:** Chrome per Playwright bei 390 px (DPR 2) und 1440 px:
  horizontaler Ueberlauf, kaputte Bilder, Konsolenfehler, CLS
- **Messung:** `npm run lighthouse:messen` vorher (5 Runden je Seite und Variante)
  und nach dem Livegang; LCP-Element und LCP-Phasen aus den Rohberichten

## 1. Ergebnis der vorhandenen Werkzeuge

| Werkzeug | Ergebnis |
|---|---|
| `liquid:guard` | 559 Dateien, 0 Fehler, 0 Warnungen |
| `schema:guard` | 278 Schemata, 0 Fehler, 0 Warnungen |
| `template:guard` | 36 Templates, 0 Fehler, 5 Warnungen (u. a. Kopf bei 50/50 Bloecken) |
| `schrift:guard` | 543 Dateien, 0 Fehler |
| `themecheck:guard` | 0 Fehler, 0 neue Warnungen (52 gegen Baseline 55) |
| `seo:check` | nicht gelaufen; die Punkte Title, Description, Canonical, H1, Alt und JSON-LD sind fuer die fuenf Seiten von Hand aus dem rohen HTML gelesen (Abschnitt 4) |

## 2. Lighthouse (mobil, simuliertes 4G, Median)

Vorher: Lauf `2026-11-09-13-42`, nachher: siehe Abschnitt 7.

| Seite | Variante | Score | LCP | LCP-Element |
|---|---|---|---|---|
| Startseite | mit / ohne Banner | 59 / 62 | 6,0 / 6,4 s | erstes Bild der Kategorie-Kacheln (`sections/tp-start-kategorien.liquid`) |
| Kollektion Teppichboden | mit / ohne Banner | 60 / 72 | 4,2 / 3,1 s | Beschreibungstext unter der H1 |
| PDP Piumera | mit / ohne Banner | 77 / 66 | 3,4 / 3,4 s | erstes Galeriebild |

Streuung je Seite gross (z. B. Startseite ohne Banner LCP 4,9 bis 7,7 s);
Minimum und Maximum stehen in der lokalen Zusammenfassung des Laufs.

LCP-Phasen (je ein Rohbericht, Runde 1, ohne Banner):

- **Startseite:** TTFB 0,1 s, Entdeckung 1,6 s, Laden 5,9 s, Rendern 0,1 s.
  Das Bild (600 px, 107 KB JPEG) teilt sich die Leitung mit der zweiten
  Kachel (600 px, 42 KB, von Chrome auf "High" gehoben), drei Schriftschnitten
  (je 40 KB) und dem noch ladenden Dokument (104 KB gzip).
- **Kollektion:** TTFB 0,1 s, Rendern 3,7 s. Das LCP-Element ist Text; er
  erscheint erst, wenn rund 470 KB HTML davor geparst sind. Das Dokument
  braucht allein 4,2 s (127 KB gzip).
- **PDP:** TTFB 0,1 s, Entdeckung 1,1 s, Laden 4,7 s (480 px, 122 KB JPEG).

Shopifys Bild-CDN liefert die stark strukturierten Teppichfotos auch als WebP
nicht kleiner (600 px: JPEG 107 KB, WebP 116 KB). Hebel sind deshalb nur die
gewaehlte Breite und die Konkurrenz um die Leitung.

## 3. Befunde

Keine kritischen Befunde. Punktzahl nach Upstream-Schema: 100 - 5 (H) - 3x2 (M)
- 3x1 (N) + 5 = **91/100** (Vergleich: 96 am 2026-10-16, damals ohne
Lighthouse und ohne Mobilpruefung).

### Hoch

**H-1 - Shopify erzeugt Meta-Descriptions mit verklebten Absaetzen und 320 Zeichen (S-C2, AEO-C2)** - *umgesetzt*
Ort: `snippets/meta-tags.liquid` (Ausgabe `page_description`)
Ohne gepflegte SEO-Beschreibung nimmt Shopify die ersten 320 Zeichen des
Produkt- bzw. Kollektionstexts und setzt zwischen Absaetzen kein Leerzeichen.
Live: `/products/broadway-05-grau-teppich-nach-mass` lieferte "… Florhoehe
ca. 12 mm.Altbestand … Technische Daten wie Brandklasse … sind fuer diese
Charge nicht belegt. Ein kos" (320 Zeichen, mitten im Wort abgeschnitten);
`/collections/reste-sonderposten` 320 Zeichen. Das betrifft alle Restrollen- und
Kettelteppich-Produkte und jede Kollektion ohne SEO-Feld - genau die Seiten,
die neu sind und noch keinen gepflegten Text haben.
Wirkung: Google und Antwortdienste zeigen einen abgeschnittenen, teils
widerspruechlichen Satz statt einer sachlichen Kurzbeschreibung.
Umsetzung: Fehlt `global.description_tag`, baut das Theme den Text selbst aus
der Beschreibung (Absatzenden als Leerzeichen) und endet an der Wortgrenze vor
156 Zeichen; auf einem Satzende ohne Auslassungszeichen. Gepflegte
SEO-Beschreibungen bleiben unveraendert (auch ueber 160 Zeichen). Gilt fuer
`description`, `og:description` und `twitter:description`.
Test: `qa/tests/meta-folgeseiten-richtlinien.test.mjs` (drei neue Faelle).

### Mittel

**M-1 - LCP-Bild der Startseite mobil zu gross gewaehlt, zweite Kachel konkurriert (H3)** - *umgesetzt*
Ort: `sections/tp-start-kategorien.liquid:78-81`
Die Kachel braucht bei 412 px und DPR 1,75 rund 490 Bildpunkte; der Srcset
bot nur 400 und 600, der Browser nahm 600 (107 KB statt 74 KB bei 500 px).
Die zweite grosse Kachel ist `eager` ohne Prioritaet und wurde von Chrome auf
"High" gehoben - sie laedt gleichzeitig mit dem LCP-Bild.
Umsetzung: Breiten 500 und 700 ergaenzt, zweite Kachel `fetchpriority="low"`
(bleibt `eager`, weil sie mobil angeschnitten sichtbar ist). Im Arbeitstheme
geprueft: 412 px/DPR 1,75 laedt 500, 390 px/DPR 3 weiter 800.

**M-2 - Reste-Seite mobil: Produkte erst nach dem zweiten Bildschirm (UX)** - *umgesetzt*
Ort: `templates/collection.sonderposten.json`
Bei 390 px stehen Ueberschrift, 320 Zeichen Beschreibung, Abholhinweis und
Unterkategorien vor der ersten Rolle; die erste Karte beginnt unterhalb des
ersten Bildschirms. Die Teppichboden-Kategorie hat dafuer schon den Block
`tp-kategorie-produktsprung` ("Direkt zu den Produkten", nur mobil).
Umsetzung: denselben Block unter die H1 der Reste-Vorlage gesetzt. Im
Arbeitstheme geprueft: sichtbar bei 390 px, springt zur Ergebnisliste, auf
Desktop ausgeblendet.

**M-3 - HTML vor `<main>` (H4, Schwelle dieses Audits)** - offen
Messwerte (roh): Startseite 463 KB, Kollektion 470 KB, PDP 362 KB,
Teppich nach Mass 651 KB, Reste 327 KB. Davon Shopify (`content_for_header`,
nicht aenderbar): Web-Pixel-Loader 33-152 KB und `ShopifyAnalytics.meta` mit
allen Produkten der Seite (Teppich nach Mass 201 KB, Kollektion 144 KB);
Theme: Kopf mit Mega-Menue 142 KB auf jeder Seite.
Wirkung: der Kollektions-LCP ist Text und haengt direkt daran (Rendern 3,7 s).
Vorschlag: Mega-Menue-Inhalte mobil erst beim Oeffnen laden (eigene Aufgabe,
halber Tag, Regressionsrisiko im Menue). Die Produktmenge im Analytics-Block
folgt der Seitengroesse der Kollektion; Teppich nach Mass zeigt bewusst alle
Qualitaeten (`docs/lessons/renderzeit-kollektionsseite.md`) - nicht ohne
Inhaber aendern.

**M-4 - Reste-Seite: Titel ohne Suchbegriff (S-C1)** - offen, Shopdaten
`<title>` ist "Reste & Sonderposten – Teppich Paradies"; Suchbegriffe wie
"Teppichboden Restrolle" fehlen. Das ist das SEO-Feld der Kollektion im Admin,
kein Theme-Code. Vorschlag: SEO-Titel und -Beschreibung der Kollektion pflegen
(z. B. Restrollen Teppichboden, Oranienburg, Abholung).

### Niedrig

**N-1 - `teppichboden`-Kollektion rendert 38 Teppichfliesen-Bilder unter den Produkten**
Ort: Section `tp_fliesen_hinweis` (`sections/tp-zubehoer-produkte.liquid`), 87 KB HTML.
Liegt hinter dem LCP, kostet aber Dokumentzeit (Dokument gesamt 4,2 s im
Test). Vorschlag: Anzahl pruefen (derzeit `limit` 8 Karten mit Farbvarianten).

**N-2 - Startseite: Konsolenfehler durch Shop-App-Iframe**
`Framing 'https://shop.app/' violates … frame-ancestors` plus 403; kommt aus
Shopifys Shop-Login-Hinweis, nicht aus dem Theme. Keine Wirkung auf die Seite.

**N-3 - Kollektionen ohne `ItemList`/`CollectionPage`-JSON-LD**
Nur `BreadcrumbList` (und `FAQPage` auf Teppich nach Mass). Produkte stehen als
Text und Link im rohen HTML, Google nutzt `ItemList` fuer Kategorien nicht als
Rich Result. Bewusst niedrig.

## 4. Was gut umgesetzt ist

Diese Punkte nicht zurueckbauen.

- **Je Seite genau ein `<title>`, ein `<h1>`, Canonical absolut auf die
  Hauptdomain, Open Graph vollstaendig** (alle fuenf Seiten).
- **Keine Bilder ohne `alt`, keine Bilder in `<main>` ohne `width`/`height`**
  (Startseite 38, Kollektion 212, PDP 40, Teppich nach Mass 147, Reste 10).
- **Kein synchrones Skript, keine Fremd-Origins** ausser `cdn.shopify.com`
  und `shop.app` auf allen fuenf Seiten.
- **LCP-Bilder** auf Startseite, PDP und Teppich nach Mass `eager` mit
  `fetchpriority="high"`, alles darunter `lazy`.
- **Produkt-JSON-LD**: `ProductGroup` mit 28 Varianten (Piumera), jedes Offer
  mit `hasMerchantReturnPolicy` und `shippingDetails` (Befund M2 vom
  16.10. ist erledigt), auch Restrollen und Kettelteppiche mit Offer.
- **Mobil 390 px:** kein horizontales Scrollen auf allen fuenf Seiten
  (Ueberlaeufe nur innerhalb der Wischleisten), keine kaputten Bilder,
  CLS 0 mobil, hoechstens 0,05 auf Desktop (PDP).
- **robots.txt** sperrt keinen Such- oder KI-Crawler, Sitemap eingetragen.

## 5. Nicht geprueft

- `seo:check` und `npm run qa` (Abschnitt 1).
- Lighthouse fuer Teppich nach Mass und Reste: das Werkzeug misst fest drei
  Seiten (Start, Kollektion, PDP).
- Felddaten (CrUX/Search Console), Warenkorb, Konto, Suche.
- Bedienung von Dialogen und Fokusfallen.

## 6. Empfohlene Reihenfolge

1. H-1, M-1, M-2 - in diesem PR umgesetzt.
2. M-4 SEO-Titel und -Beschreibung der Reste-Kollektion im Admin pflegen (10 min, Shopdaten).
3. M-3 Mega-Menue mobil nachladen - eigene Aufgabe mit Messung vorher/nachher.
4. N-1 Anzahl der Teppichfliesen-Karten auf Teppichboden-Seiten pruefen.

## 7. Messung vorher und nachher

Wird nach dem Livegang ergaenzt.
