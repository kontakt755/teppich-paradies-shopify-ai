# Handoff: Kettelservice nach Lieferant und Produkt

Stand 2026-09-11, Fassung 2 · Aufgabe #188 (**blockiert**, wartet auf Entscheidungen 1–8) ·
Branch `feature/kettelservice-neutral` · Namen pseudonymisiert (Lieferant A bis D, Hausmarke von A), Rohdaten
und Originalfassung nur lokal unter `~/teppich-paradies-analyse/lieferantendaten/` (Schluessel in `INHALT.md`)

## Auftrag in einem Satz

Kettelservice nur fuer belegte Varianten anbieten, sonst vollstaendig verbergen — eine Wahrheit je Variante,
Lieferant nie im Browser.

## Stand

Nur Analyse, Read-only-Audit und Vorbereitung. **Keine Shopify-Aenderung.**

| Ergebnis | Varianten | Produkte |
|---|---:|---:|
| freigabefaehig (SKU = Artikel bei A, Produktseite von A: 030 Wool & Sisal + Qualitaet, TTD „Maßteppich“) | 104 | 10 |
| belegt, aber SKU weicht ab — erst nach Korrektur | 56 | 4 |
| ungeklaert (Sprint 027, Trend 026, Format 028, Atelier 30, Fliese) | – | 37 |
| nicht verfuegbar (Entwurf von Lieferant B) | – | 1 |
| Kettelservice heute im Shop | 0 | 0 |

Freigabefaehig: Wovena, Callista, Nordica, Woolara, Sisara, Sisola, Regalia, Boucella, Fibrella, Rubira.
Nach SKU-Korrektur: Merinda (Denia), Lanova (Mavie), Lanetta (Lida), Vellana (Cosmo).
Einzelnachweis: `kettelservice-varianten-beleg-2026-09-11.json` (lokal).

## Verbindliche Regeln des Inhabers (2026-09-11)

1. **Fail closed.** Nur exakt `service.kettelservice = Verfügbar` an der gewaehlten Variante. Sonst — fehlend,
   Nicht verfügbar, Ungeklärt, unbekannter Wert, Tippfehler, neues Produkt, neuer Lieferant, nicht zugeordnet —
   vollstaendig verborgen: keine Option, kein deaktivierter Knopf, kein „auf Anfrage“, keine Ableitung.
2. **Keine Heuristik.** Nie aus Name, Titel, Hersteller, Kollektion, Material, Produktart, Technik, Bildern,
   aehnlichen Produkten oder baugleicher Ware eines anderen Lieferanten.
3. **Lieferant B/C** immer `Nicht verfügbar`; ein `Verfügbar` dort ist ein Datenfehler, der gemeldet wird.
4. **Lieferant A nur per Whitelist**; keine Uebertragung auf andere Produkte, Varianten, aehnliche Qualitaeten oder
   zukuenftige Produkte.
5. **Kleinste Ebene**: Variante. Eine freigegebene Variante schaltet nie das ganze Produkt frei.
6. **Lieferantendaten strikt intern** (`einkauf.*`). Lieferant A bis D und die Hausmarke von A nie
   kundensichtbar — auch nicht in JSON, JSON-LD, data-*, Properties, Ajax-Cart, Section Rendering, URLs,
   Suche, Filtern, Pixeln, E-Mails.
7. **Storefront liest nur `service.kettelservice`**, nie `einkauf.lieferant`.
8. **Jede Freigabe dokumentiert**: Qualitaet, Beleg, Pruefdatum, Varianten (intern).
9. **Importschutz**: Konflikt → stoppen, melden, nichts freischalten, Mensch entscheidet.
10. **Altbestand auditieren**, parallele Logik entfernen — am Ende genau ein Entscheidungsweg.
11. **Testmatrix** mit 15 Faellen vor Freigabe (unten).
12. **Vor Entscheidungen 1–8**: keine Storefront, keine Datenmigration, keine Massenaenderung, keine Titel-,
    SKU- oder Preisaenderung, kein Push. Danach zuerst Umsetzungsplan mit Dateien und Datenaenderungen
    vorlegen, dann bauen.

## Entscheidungen Runde 2 (Inhaber, 2026-09-11) — beantwortet

Einfassen und Raummass fuer **alle 49 Teppichboeden von Lieferant A ausser Nadelfilz und Sauberlauf**; vier
Einfassarten als eigene Produkte (**Cover** = bisher Kippkante, Ketteln, Einfassband, Paspelband); Cover nur mit
Vlies und bis Rollenbreite − 10 cm; Laenge bis 10 m; Formen Rechteck/Rund/Oval/Schablone/Skizze; Raummass =
m²-Preis + 35 %; Rollenrechner mit Kettelleisten und Haftunterlage. Damit sind die alten Entscheidungen 2 und 3
erledigt, 1 (Preise) bleibt offen. **Konkreter Plan: `UMSETZUNGSPLAN.md`**; Theme-Code und Werkzeuge dazu in
PR #195.

## Offene Entscheidungen (echte Blocker)

1. Kettelpreis und Abrechnung (pro laufendem Meter oder Groessenklasse wie bei A bis 4 × 4 / 6 × 4 m).
2. Start nur mit den 104 freigabefaehigen Varianten.
3. Nur Ketteln rundum oder auch Borduere/Kippkante.
4. Anfrage an Lieferant A (fuenf Fragen in der lokalen Regeltabelle).
5. Hausmarke von A bei 19 Zubehoerartikeln: bleibt die echte Herstellermarke (Entscheidung 2026-09-08) oder weg?
   Nicht ohne Rueckfrage aendern.
6. ~~GitHub-Repository oeffentlich: privat stellen oder Lieferantendaten auslagern?~~ Entschieden (#203):
   Repository bleibt oeffentlich, Lieferantendaten liegen lokal, im Repo nur Pseudonyme.
7. SKU-Korrektur: 56 Varianten der Whitelist (`…4_`/`…5_` → `…04_`/`…05_`) und 63 Klebevinyl-Varianten mit
   Beschreibung im SKU-Feld (Ursache der Such- und JSON-Leaks).
8. Lieferant C = reiner Alias von Lieferant B? (nirgends unabhaengig belegt)

## Pruefungen dieser Fassung

**Lieferant C (Regel 3):** gesucht in 434 Produkten, allen Repository-Branches, im Postfach und im Impressum von
Lieferant B — kein Treffer. Einzige Quelle ist die Aussage des Inhabers. Gefuehrt als Alias von B, keine eigene
Serviceentscheidung, kein Altbestand.

**Produkt oder Variante (Regel 5):** Entscheidung je Variante. Varianten koennen abweichen (Lavi/Vida nur 400 cm,
56 Varianten mit abweichender SKU). Search & Discovery filtert Varianten-Metafelder, Smart Collections kennen
`VARIANT_METAFIELD_DEFINITION`. Kein zusaetzliches Produktfeld, sonst zwei Wahrheiten.

**Altbestand (Regel 10):**

| Bereich | Befund | Folge |
|---|---|---|
| Kettel-Logik alt | keine — Theme, Snippets, JS, Produkt-/Varianten-Metafelder, Metaobjekte, Tags, Beschreibungen | – |
| Mass-Logik ruhend | `blocks/tp-teppich-wunschmass.liquid` (kein Produkt nutzt es), App-Block Options Price Calculator in `product.teppich.json` deaktiviert, `opc-`-Varianten: keine | beim Umbau entfernen oder eindeutig deaktivieren |
| Statischer Text | „Wunschmaß möglich“ (`tp-vertrauen`) meint Zuschnitt auf Laenge | pruefen, dass er nicht als Kettelaussage gelesen wird |
| Nicht per API | E-Mail-Vorlagen, Checkout, Kundenkonto, Bestellstatus | Testfall 15 mit Testbestellung |

**Leakage (Regel 6):**

| Kanal | Ergebnis |
|---|---|
| Liquid, HTML, HTML-Kommentare, JSON-LD, data-*, versteckte Inputs, Handles, URLs, Filter, Vergleich, Warenkorb-Properties, Lead-Events/DataLayer | sauber |
| Storefront-Suche | der Name von Lieferant A findet 24 Klebevinyl-Produkte — ueber das SKU-Feld |
| `/products/*.js`, `/cart.js`, Produktkarten-Fragment (Section Rendering API) | SKU mit dem Namen von A („… Design 555 …“) bei 63 Klebevinyl-Varianten, im Fragment als sichtbarer Text |
| Web Pixels (Analytics) | erhalten SKUs, auch solche mit dem Kuerzel der Hausmarke von A |
| Storefront-API | `grosshandel.sku` (Texte mit den Namen von A und B), `tp_farbe.lieferant` und 15 Hinweise mit Hausmarke bzw. Shop-Domain von A |
| Zubehoer | 19 × Hausmarke von A (bewusst, Entscheidung 5) |
| Wunschliste | nicht vorhanden |
| Checkout, Kundenkonto, Bestellstatus, E-Mails | offen bis Testbestellung |

## Testmatrix (Regel 11)

Erwartung in jedem unklaren Fall: **vollstaendig verborgen.** Liste mit Erwartungen in der lokalen Regeltabelle
unter `testmatrix` (1 Lieferant A + Verfügbar · 2 Ungeklärt · 3 Nicht verfügbar · 4 neues Produkt ·
5 Lieferant B · 6 Lieferant C · 7 Lieferant D · 8 ohne Lieferant · 9 ohne Feld · 10 ungueltiger Wert ·
11 Variantenfall · 12 Warenkorb · 13 Mobil · 14 Desktop · 15 Bestellung/E-Mail).

## Nach Beantwortung

Zuerst einen **Umsetzungsplan** vorlegen (Regel 12): betroffene Dateien (`blocks/tp-rollware-rechner.liquid`,
Facetten-Snippet, Warenkorb-Snippets, zu entfernende Mass-Logik), anzulegende Metafeld-Definitionen und
Metaobjekte, genaue Datenaenderungen (welche Varianten welchen Wert erhalten), Rueckweg. Erst nach Freigabe:
Definitionen → Sync und Guard (Trockenlauf, dann nur die freigegebenen Varianten) → Theme im Branch →
Testmatrix → Service-Produkt mit Preis → S&D-Filter (manuell) und Kollektion → Preview → Live ueber die
Deploy-Kette.

## Wo was liegt

| Pfad (lokal, unter `~/teppich-paradies-analyse/lieferantendaten/`) | Inhalt |
|---|---|
| `domains/lieferanten/services/kettelservice-regeln.json` | Regeln, Belege, Validierung, Importschutz, Testmatrix, Audit |
| `domains/lieferanten/services/kettelservice-varianten-beleg-2026-09-11.json` | Whitelist je Variante |
| `domains/lieferanten/services/kettelservice-bestand-2026-09-11.csv` | alle 434 Produkte |
| `domains/lieferanten/teppichboden-abgleich/rohdaten/` | Produktseiten von A mit TTD-Links |
| `originale/domains/lieferanten/services/` | diese Dokumente in der Fassung mit echten Namen |

Belege reproduzieren: Quicksearch von A `…/de-DE/quicksearch?query=<SKU>` (exakter `material_number`),
Produktseite von A (`product-attribute-name` Kollektionsname/Qualität), TTD per curl + `pypdf` in einer venv,
Einfassungskatalog nur per Puppeteer (Netzwerkantworten `flash/search/search000N.xml`).

## Nicht tun

Keine SKUs, Preise, Titel, Metafelder oder Templates im Shop aendern; nicht ins Preview-Theme schreiben;
Lieferantennamen nirgends „versteckt“ unterbringen, auch nicht im Repository; nichts aus Aehnlichkeit freischalten.
