# Theme-Audit 2026-11-18

Vierter Lauf des Skills `theme-audit`, nur lesend. Gemeldet wird, was gegenüber
[2026-11-11](theme-audit-2026-11-11.md) neu oder weiter offen ist. Preise und
Rechtstexte sind nicht Teil des Audits.

- **Stand:** `main` bei `bb1d2c10`, Live-Shop am 2026-11-18 (rohes HTML per curl, ohne Preview-Parameter)
- **Seiten:** Startseite, `/collections/teppichboden`, `/collections/reste-sonderposten`, `/products/piumera-teppichboden-400cm-500cm`
- **Nicht geprüft:** `seo:check`, `lighthouse:messen` (laufen nicht in diesem Lauf), Theme Check (Lauf bei Absturz abgebrochen, wird im PR über `pruefen` abgedeckt)

## 1. Guards

| Guard | Ergebnis |
|---|---|
| `liquid:guard` | 563 Dateien, 0 Fehler, 0 Warnungen |
| `schema:guard` | 279 Schemata, 0 Fehler, 0 Warnungen |
| `template:guard` | 36 Templates, 0 Fehler, 5 Warnungen (u. a. `header-group.json` bei 50 von 50 Blöcken) |
| `schrift:guard` | 546 Dateien, 0 Fehler |

## 2. Befunde

Keine kritischen. Auf allen vier Seiten: ein `<h1>`, kein Bild ohne `alt`,
keine doppelten IDs (Befund 7 vom 11.11. behoben), keine blockierenden
Fremdskripte, `tp-startseite.css` nur einmal eingebunden (Befund 5 behoben),
Produkt-JSON-LD ohne Wiederholung der Variantenbeschreibung (Befund 3 behoben).
Robots/Abrufbarkeit: `robots.txt` ohne `Disallow: /`; `llms.txt`, `sitemap.xml`,
`/policies/refund-policy`, `/policies/shipping-policy` antworten 200.

**1. (Mittel, C6) Menübilder ohne `width`/`height`** – `snippets/tp-menu-bild.liquid`
(per `echo` gebautes `<img>`, Theme Check sieht es nicht). Live je Seite 41
Bilder ohne Maße (Mega-Menü, Drawer). Sie sind lazy und im verborgenen Menü,
CLS-Wirkung gering, aber Maße fehlen für das Seitenverhältnis vor dem Laden.
Vorschlag: `width="800" height="450"` (CSS füllt per `object-fit: cover`). **Umgesetzt im PR.** Aufwand S.

**2. (Mittel, weiter offen) HTML-Gewicht vor `<main>`** – Startseite 747 KB,
Kollektion 1,23 MB, Produktseite 827 KB roh; Hauptanteil Shopify-Inline-Skripte
und Mega-Menü. Abhilfe: Menüinhalt mobil erst beim Öffnen laden, vorher/nachher
mit `lighthouse:messen`. Aufwand M.

**3. (Mittel, weiter offen) Rollwarerechner als 94 KB Inline-Skript**
(`blocks/tp-rollware-rechner.liquid`), nicht cachebar. Abhilfe: in Asset
auslagern, Verhalten unverändert (fertige Funktion). Aufwand L.

**4. (Niedrig, weiter offen)** Reste-Seite: SEO-Titel/-Beschreibung im Admin pflegen
(Inhaber, 10 Minuten); Kollektionen ohne `ItemList` (Reste inzwischen mit);
`llms.txt` nennt nur zwei Richtlinien (Plattformverhalten, Klärung offen).

**5. (Niedrig)** Leerer, versteckter Link `data-bf-alle` auf Startseite und
Kollektion (`hidden`, wird per Skript gefüllt) – kein Befund für Screenreader.

## 3. Gut umgesetzt (nicht zurückbauen)

Logo mit `width`/`height`; alle Bilder mit `alt` (Deko `alt=""`); `fetchpriority`
gezielt gesetzt; keine blockierenden Skripte; Crawler nicht gesperrt;
Produkt-JSON-LD mit ProductGroup, Rückgabe- und Versandangaben.

## 4. Empfohlene Reihenfolge

1. Menü mobil nachladen (Befund 2, misst sich)
2. Reste-SEO im Admin (Befund 4)
3. Rollwarerechner auslagern (Befund 3, nur mit Testsuite und Warenkorb-Durchlauf)
