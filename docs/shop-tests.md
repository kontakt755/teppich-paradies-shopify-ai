# Shop: Testprotokoll

## 2026-09-20 - S-01 + S-02 (Einfass-Konfigurator)
Theme: unpublished Test-Theme per `workflow:scratch`, Produkt `altessa-teppich-nach-mass`.

| Pruefung | Desktop | Mobil 375 |
|---|---|---|
| Umschalter "Im Raum", Buehne, Raumwahl nicht im DOM | ok | ok |
| Text "So rechnen wir" / `.tp-ek__details` nicht im DOM | ok | ok |
| Mass 200 x 300 ergibt "Ihr Preis 346,00 EUR", sichtbar | ok | ok |
| Masszeichnung sichtbar (13 SVG-Elemente), kein leerer Platzhalter | ok | - (nur DOM geprueft) |
| Warenkorb-Button aktiv | ok | - |
| Konsole ohne Fehler | ok | - |
| kein horizontales Scrollen | - | ok |

Statisch: liquid/schema/template/theme-guard 0 Fehler, `npm test` 37/37, `validate --static` PASS.

Nicht getestet: echter Warenkorb-Eintrag (Warenkorb-Code unveraendert), Rund/Oval- und
Mindestpreis-Hinweis optisch, Screenshot des Konfigurators (Desktop-Screenshot blieb leer).

Regressionen: keine gefunden. KORREKTUR: der gequetschte MwSt-Text war doch ein Live-Fehler - die erste Pruefung suchte nur Elemente ohne Kind-Elemente und lief zudem mit Preview-Cookie. Siehe S-17.

## 2026-09-20 - Livegang S-01 + S-02 (Commit a0cbd07)
- `workflow preview`: COMPARE, SEO, FULL QA, SALES, alle Guards PASS.
- Preview-Theme und danach Live (`Shopify.theme.role = main`), Produkt `altessa-teppich-nach-mass`, Desktop:
  kein "Im Raum", kein "So rechnen wir", 200 x 300 ergibt 346,00 EUR, Masszeichnung da, Warenkorb-Button aktiv.
- Zwei 401-Konsolenmeldungen im Preview-Modus, nicht aus Theme-Dateien (alle Theme-Assets 200).
- Nicht getestet: Live mobil nach dem Rollentausch, echter Warenkorb-Eintrag.

## 2026-09-20 - S-04 Ab-Preis Teppiche (Scratch-Theme)
- Unit: `qa/tests/tp-teppich-ab-preis.test.mjs` 12/12 - Liquid-Snippet gegen Rechenkern (6 Preisstufen, Mindestpreis, andere Einfassart, Kettelservice nicht kaufbar, Mass passt nicht).
- Echte Daten, `/collections/teppiche`: 24 Karten, 119,80 bis 263,80 EUR; Wovena Karte "ab 197,80 EUR" = Konfigurator bei 80 x 150 "197,80 EUR" (ebenso 50 x 50: 99,64 EUR in beiden).
- Mobil 375: Karte ruhig, kein horizontales Scrollen (Screenshot geprueft). Desktop: nur DOM geprueft.
- Gegenprobe `/collections/teppichboden`: 0 Ab-Preis-Elemente, weiter "ab XX EUR/m2".
- Nicht getestet: Suchergebnisse, Empfehlungen, Startseiten-Karussell (nutzen denselben Block, nicht einzeln angesehen).

## 2026-09-20 - S-05/S-07/S-17 (Scratch-Theme)
- PDP Teppich (wovena, lanova): "ab 197,80 EUR / ab 245,80 EUR · z. B. 80 x 150 cm · EUR/m2", alter m2-Preis nicht mehr sichtbar; Empfehlungen zeigen dieselbe Anzeige. Mobil-Screenshot geprueft.
- PDP Teppichboden (zafira-teppichboden): weiter "38,90 EUR/m2", kein ab-Preis.
- S-17: vorher live `.tp-preisangabe` mobil 16 x 3149 px, Desktop eigene Rasterzelle. Nachher 343 x 18 (mobil) / 376 x 18 (Desktop), in der Detailspalte, Raster hat wieder 2 Kinder. Auf Teppich- und Teppichboden-PDP geprueft.
- Unit 14/14 im Ab-Preis-Test (neu: Rollenware ohne Einfassung, gewaehlte Variante).
- Farbwechsel auf der PDP (wovena): Variante wechselt, ab-Preis bleibt stehen, kein alter m2-Preis.
- Nicht getestet: Vinyl-/Zubehoer-PDP fuer S-17, Sticky-Leiste.

## 2026-09-20 - Livegang PR #391 (Commit f108fdd)
- Preview Lauf 1: SALES FAIL - nur "Klickvinyl mobil", Cookie-Banner fing den Klick ab. Zwei gezielte Wiederholungen (`--package --mobile`) PASS, voller zweiter Preview-Lauf komplett PASS. Kein Gate veraendert. -> S-18.
- Live (`Shopify.theme.role = main`), mobil 375: wovena "ab 197,80 EUR", Konfigurator 80 x 150 = 197,80 EUR; PAngV-Hinweis 343 x 18; kein "Im Raum", kein "So rechnen wir"; kein horizontales Scrollen. zafira-teppichboden: "38,90 EUR/m2", kein ab-Preis, Hinweis 343 x 18. Kollektion teppiche liefert ab-Preise im HTML.
- Nicht getestet live: Desktop-Optik, Suche/Startseite, echter Warenkorb-Eintrag.

## 2026-09-20 - S-06 Teppich-Karte (Scratch-Theme)
- `/collections/teppiche`, mobil 375: 24 Karten mit "Wunschmass verfuegbar", Knopf "Jetzt konfigurieren" 343 x 44 (Link auf die Produktseite), Textlinks Muster 44 x 44 und Vergleichen 74 x 44, kein horizontales Scrollen. Screenshot geprueft.
- Vergleichen-Klick setzt `aria-pressed=true`. Konsole ohne Theme-Fehler.
- Gegenprobe `/collections/teppichboden`: 0 Teppich-Varianten, Muster-Knopf unveraendert braun mit "Muster anfordern".
- Nicht getestet: Desktop-Optik (nur mobil angesehen), zweispaltiges Mobilraster (Test-Theme zeigt einspaltig).
