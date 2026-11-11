# Theme-Audit 2026-11-11

Dritter Lauf des Skills `theme-audit`, nur lesend. Gemeldet wird nur, was gegenüber
[2026-10-16](theme-audit-2026-10-16.md) und [2026-11-09](theme-audit-2026-11-09.md)
neu oder weiter offen ist. Bis 30.11. läuft Black Week: Preise und Rabattanzeige
sind nicht Teil des Audits.

- **Stand:** `main` bei `3663a8a6`, Live-Shop am 2026-11-11
- **Seiten (rohes HTML per curl, Live, ohne Preview-Parameter):** Startseite,
  `/collections/teppichboden`, `/products/piumera-teppichboden-400cm-500cm`
  (Teppichboden), `/products/eiger-elite-91-beige-teppich-nach-mass`
  (Teppich nach Maß, Restrolle gekettelt), `/collections/reste-sonderposten`
- **Zusätzlich:** `robots.txt`, `sitemap.xml`, `llms.txt`, 61 interne Links
  aus den Seiten auf Status geprüft, Crawler-User-Agents (GPTBot, ClaudeBot,
  PerplexityBot, Google-Extended, OAI-SearchBot) auf eine Produktseite
- **Größen:** "roh" = unkomprimiert, "gz" = übertragen

## 1. Ergebnis der vorhandenen Werkzeuge

Siehe Abschnitt 6 (Lauf von `npm run -s pruefen` vor dem PR). `seo:check` und
`lighthouse:messen` sind in diesem Lauf nicht gelaufen (Abschnitt 5).

## 2. Befunde (nach Wirkung)

Keine kritischen Befunde. Alle fünf Seiten: genau ein `<title>`, ein `<h1>`,
Canonical absolut und ohne Parameter, Meta-Description vorhanden, Open Graph
vollständig, kein Bild ohne `alt`, keine Fremd-Origins außer `cdn.shopify.com`
und `shop.app`, kein App-Embed (`/extensions/`) im HTML.

**1. HTML-Gewicht vor `<main>` (weiter offen, M-3 vom 09.11.)**
Beleg (roh, Byte vor `<main`): Startseite 464 KB, Kollektion 471 KB,
Produktseite Teppichboden 363 KB, Teppich nach Maß 315 KB, Reste 327 KB.
Gesamtgröße roh/gz: Startseite 750/112 KB, Kollektion 1,23 MB/144 KB,
Produktseite 887/153 KB. Der Hauptblock sind Shopify-eigene Inline-Skripte
(`wpmLoader`: Startseite 172 KB, Produktseite 66 KB, Kollektion 33 KB;
`ShopifyAnalytics.meta` der Kollektion 144 KB) – nicht änderbar – und das
Mega-Menü im Kopf (Theme).
Wirkung: Auf der Kollektion ist das LCP-Element Text; er erscheint erst nach
diesem Vorlauf (Messung vom 09.11.).
Kleinste Abhilfe: Mega-Menü-Inhalt mobil erst beim Öffnen laden; vorher/nachher
messen (`lighthouse:messen`, beide Stände zur selben Tageszeit).
Aufwand: M (Regressionsrisiko im Menü)

**2. Produktseite Teppichboden: Rollwarerechner steckt als 94 KB Inline-Skript im HTML**
Beleg: `blocks/tp-rollware-rechner.liquid:1378-3221` (Skript, rund 1 840 Zeilen)
und `:771-881` (JSON-Daten); im Live-HTML 94 KB Skript plus rund 54 KB Daten.
Auf der Produktseite stehen insgesamt 420 KB Inline-Skripte (Startseite 259 KB,
Teppich nach Maß 119 KB).
Wirkung: Das Skript hängt an einer Instanz-ID (`tpRwcInit<id>`) und kann der
Browser nicht zwischenspeichern; jeder Produktaufruf lädt es neu, und es liegt
vor dem Seitenende im Parser-Weg.
Kleinste Abhilfe: Logik einmalig in eine `assets/tp-rollware-rechner.js` legen,
Instanz-ID und Daten per `data-`Attribut übergeben. Der Rechner ist laut
`AGENTS.md` eine fertige Funktion: nur verschieben, Verhalten nicht ändern,
mit der vorhandenen Testsuite und einem Warenkorb-Durchlauf absichern.
Aufwand: L

**3. Produkt-JSON-LD wiederholt die Beschreibung bei jeder Variante (Produktseite Teppichboden)**
Beleg: `snippets/tp-product-structured-data.liquid:498-499` (Variante) und
`:621-622` (ProductGroup). Live: 28 Varianten tragen alle denselben
2 265-Zeichen-Text; das JSON-LD ist 135 KB groß, davon rund 63 KB Wiederholung.
Wirkung: Roh 63 KB mehr zu parsen, für KI- und Suchcrawler ohne Zusatznutzen;
gz spart wenig, weil sich Wiederholungen gut komprimieren.
Kleinste Abhilfe: Variantenbeschreibung weglassen, wenn sie der Beschreibung der
ProductGroup entspricht (`description` ist an `Product` optional).
Aufwand: S

**4. Reste-Seite: SEO-Titel und -Beschreibung nicht gepflegt (weiter offen, M-4 vom 09.11.)**
Beleg: `<title>` live "Reste & Sonderposten – Teppich Paradies"; Meta-Description
endet mitten im Satz mit "…" ("…weil wir dieselben…", automatisch aus dem
Kollektionstext).
Wirkung: In der Suche steht ein abgebrochener Satz ohne Suchbegriff
("Restrolle", "Teppichboden", "Oranienburg").
Kleinste Abhilfe: SEO-Titel und -Beschreibung der Kollektion im Admin pflegen
(Shopdaten, kein Theme-Code).
Aufwand: S (10 Minuten, durch den Inhaber)

**5. Startseite: `tp-startseite.css` wird 14-mal eingebunden**
Beleg: `sections/tp-start-faq.liquid:5`, `sections/tp-bodenprobleme.liquid:36`,
`sections/tp-vorher-nachher.liquid:6` u. a. – 36 Dateien tragen dieselbe Zeile
`{{ 'tp-startseite.css' | asset_url | stylesheet_tag }}`; im Live-HTML der
Startseite stehen 14 gleiche `<link rel="stylesheet">` (alle 21 Stylesheets der
Seite sind blockierend, die Datei hat 1,1 KB gz).
Wirkung: Der Browser lädt die Datei einmal, aber 13 überflüssige blockierende
Tags kosten HTML und Style-Neuberechnung.
Kleinste Abhilfe: Datei einmal im Kopf (`layout/theme.liquid`, nur für Vorlagen,
die sie brauchen) oder in einer Startseiten-Section einbinden und die übrigen
Zeilen entfernen; danach `template:guard`.
Aufwand: S

**6. Kollektionen ohne Produktliste im JSON-LD (weiter offen, N-3 vom 09.11.)**
Beleg: Kollektion und Reste tragen nur `Organization` und `BreadcrumbList`;
Reste hat 20 Produkte (alle auf einer Seite), im HTML 25 Produktlinks in `<main>`.
Wirkung: Für KI-Abruf stehen die Rollen nur als Link und Kartentext da, nicht
als strukturierte Liste mit Preis. Google zeigt dafür kein Rich Result.
Kleinste Abhilfe: Auf der Reste-Seite (kurze Liste, wechselnder Bestand) ein
`ItemList` mit URLs ausgeben; auf der Kollektion nicht (Seitengröße).
Aufwand: M

**7. Doppelte ID `cart-drawer-heading-empty` auf jeder Seite**
Beleg: `snippets/header-actions.liquid:145`; in allen fünf Live-Seiten genau
eine doppelte ID, sonst keine.
Wirkung: Ungültiges HTML; `aria-labelledby` (Zeile 181) kann auf die falsche
Überschrift zeigen (Warenkorb-Schublade für Screenreader).
Kleinste Abhilfe: ID pro Instanz eindeutig machen (z. B. mit `section.id`),
`aria-labelledby` anpassen.
Aufwand: S

**8. Teppich nach Maß: Offer-URL trägt Maßparameter, Canonical nicht**
Beleg: Live-JSON-LD `…?variant=…&breite=80&laenge=150#offer`; Canonical
`…/eiger-elite-91-beige-teppich-nach-mass` (ohne Parameter).
Wirkung: Die Angebots-URL weicht von der Canonical ab; Google gleicht beide
meist selbst an, ein Risiko bei Merchant-Abgleich bleibt.
Kleinste Abhilfe: Prüfen, ob die Parameter für den Preis (80 × 150 cm) in der
URL nötig sind; sonst `variant`-URL ohne Maße ausgeben. Preislogik nicht
ändern (`snippets/tp-product-structured-data.liquid`, Kopfkommentar).
Aufwand: S (Prüfung), M (Änderung)

**9. `llms.txt` nennt nur zwei der Rechtsseiten**
Beleg: `https://www.teppich-paradies.net/llms.txt` (von Shopify erzeugt) führt
unter "Store Policies" nur Datenschutz und AGB; `/policies/refund-policy` und
`/policies/shipping-policy` antworten mit 200 und Text.
Wirkung: KI-Agenten bekommen Widerruf und Versand nicht über diese Datei. Die
Seiten sind über die Sitemap und die Produkt-JSON-LD (`shippingDetails`,
`hasMerchantReturnPolicy`) trotzdem auffindbar.
Kleinste Abhilfe: Ursache klären (Shopify-Einstellung "Richtlinien" im Admin
oder Plattformverhalten); im Theme nicht änderbar. Rechtstexte bleiben unberührt.
Aufwand: S (Klärung, Inhaber)
Ursache nicht geprüft.

## 3. Was gut umgesetzt ist (nicht zurückbauen)

- **Abrufbarkeit:** `robots.txt` sperrt keinen Such- oder KI-Crawler; alle fünf
  geprüften Crawler-User-Agents erhalten 200 auf der Produktseite. `llms.txt`,
  `/agents.md` (Sitemap `sitemap_agentic_discovery.xml`) und UCP sind vorhanden.
- **Produkt-JSON-LD:** `ProductGroup` mit Varianten, `Offer` mit
  `hasMerchantReturnPolicy`, `shippingDetails` und Lieferzeit; Flächenpreis als
  `UnitPriceSpecification` (€/m², bewusst so); Restrollen mit eigener Lieferzeit
  (5–8 Tage gegenüber 2–5). Restbestand als `LimitedAvailability`
  (`snippets/tp-product-structured-data.liquid:79-84`).
- **Meta-Descriptions:** auf allen Produkt- und Kollektionsseiten gepflegt oder
  sauber gekürzt; Startseite mit Suchbegriff und Nutzenversprechen.
- **Startseite:** `H1` mit Suchbegriff und Ort; `Organization`/`Store`,
  `WebSite` und `FAQPage` im JSON-LD.
- **Ladereihenfolge:** kein synchrones Skript, LCP-Bilder `eager` mit
  `fetchpriority="high"`, darunter alles `lazy`; Seitennavigation `rel="next"`
  auf der Kollektion.
- **App-Last:** keine App-Embeds, keine Drittanbieter-Origins außer Shopify;
  im HTML kein Skript von Google Tag Manager oder `gtag/js`
  (Treffer 0); Tracking-Konfiguration steckt im Shopify-Pixel-Loader.
- **Teppichfliesen-Hinweis auf der Teppichboden-Kollektion:** begrenzt auf 8
  Produkte (N-1 vom 09.11. damit erledigt).
- **Interne Links:** von 61 aus den fünf Seiten geprüften Pfaden antworteten 56
  mit 200; die fünf übrigen waren CSS-Pfade mit `//`-Präfix, die mein Skript
  falsch zusammengesetzt hat (eine Stichprobe, `tp-startseite.css`, antwortet 200).
  Kein toter Seitenlink gefunden.

## 4. Empfohlene Reihenfolge

1. Nr. 4 (Reste-SEO im Admin pflegen) – 10 Minuten, sichtbar in der Suche.
2. Nr. 5 und Nr. 7 – je kleiner, sicherer Theme-Eingriff.
3. Nr. 3 – Beschreibung im Varianten-JSON-LD weglassen.
4. Nr. 1 – Mega-Menü nachladen, mit sauberer Vorher-/Nachher-Messung.
5. Nr. 2 – Rechner-Skript auslagern, nur mit Warenkorb-Durchlauf.

## 5. Nicht geprüft

- `seo:check`, `npm run qa` und `lighthouse:messen` (Messlauf rund 25 Minuten;
  die Werte vom 09.11. gelten weiter und streuen stark). Performance-Aussagen
  hier stützen sich nur auf Größen im rohen HTML.
- Darstellung (Mobil 390 px, Konsolenfehler, CLS) – nur Quelltext gelesen.
- Felddaten (Search Console, CrUX) und Merchant Center.
- Warenkorb, Konto, Suche, Dialoge und Fokusführung.
- Ursache zu Nr. 9 (`llms.txt`) und die Wirkung der Maßparameter bei Google (Nr. 8).
- Preise, Rabattanzeige und Rechtstexte (wegen Black Week und `AGENTS.md` bewusst
  ausgenommen).

## 6. Ergebnis der Prüfungen vor dem PR

`npm run -s pruefen` am 2026-11-11: alle 11 Schritte bestanden (Tests, Python,
Liquid-, Schema-, Template-, Theme-, Schrift-, Changelog-, Bewertungs-Guard,
Theme Check gegen die Baseline, Secret-Scan). Die Guards prüfen den Theme-Code,
nicht diese Berichtsdatei.
