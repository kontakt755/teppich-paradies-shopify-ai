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

## 2026-09-20 - Livegang PR #393 (Commit 1e03b55)
- Preview komplett PASS im ersten Lauf (COMPARE, SEO, FULL QA, SALES).
- Live (`role = main`), mobil 375, `/collections/teppiche`: 24 Karten mit Hinweis und Knopf 343 x 44 in Muster-Braun, Link auf die Produktseite, ab-Preis daneben, kein horizontales Scrollen. `/collections/teppichboden`: 0 Konfigurieren-Knoepfe.
- Desktop nur vermessen (Knopf 389 x 44, Preiszeile einzeilig), kein brauchbarer Screenshot.

## 2026-09-20 - S-08/S-09 Aktionshinweis (Scratch-Theme)
- Unit `qa/tests/tp-aktion-aktiv.test.mjs` 7/7: ohne Start keine Aktion, Start heute, Ende heute zaehlt mit, Start morgen, Ende gestern, Produkt ohne Metafelder.
- Echte Daten: `aktion.start` = heute testweise an zafira-teppichboden gesetzt (Live-Theme kannte den Code nicht -> dort wirkungslos). Scratch mobil 375: Box "Aktionspreis / Kostenlose Lieferung bis Bordsteinkante inklusive. Nicht kombinierbar ..." 343 x 112, das aufklappbare Kostenlos-Versprechen ist weg, kein horizontales Scrollen. Uebrige "kostenlos"-Texte der Seite: Muster, Aufmass - kein widerspruechliches Verlege-Versprechen.
- Gegenprobe piumera-teppichboden (ohne Metafeld): normaler Hinweis "Ab 649 EUR Warenwert bis 15 km kostenlos", keine Aktionsbox.
- Test-Metafeld danach geloescht, per Read bestaetigt (0 aktion-Metafelder).
- Nicht getestet: Optik per Screenshot (Browserfenster lieferte leere Bilder), Desktop, Enddatum mit echten Daten (nur Unit).
- Nachtrag: `npm test` schlug zuerst mit 2 Fehlern an - zwei bestehende Schutztests in `qa/tests/verlegeservice.test.mjs` (aeussere Bedingung `if vsh_gilt == 'ja'`; "kostenlos" nie ohne Zone). Block umgebaut (Aktion verzweigt INNERHALB der Berechtigung), Test um die Bordsteinkanten-Zeile gezielt erweitert und ein neuer Test sichert, dass der Aktionszweig kein Kostenlos-Versprechen enthaelt. Danach 578 + 37 gruen, static PASS. Beide Pfade erneut im Scratch geprueft; Aufklapp-Pfeil in der Aktionsbox ausgeblendet (`::after` display none bestaetigt). Test-Metafeld wieder geloescht.
- Lehre: Tests VOR dem Commit abwarten, Befehle nicht mit `;` hinter `npm test` ketten.

## 2026-09-20 - S-21 m2-Preis raus (Scratch-Theme)
- Unit 14/14 (neu: bei belegtem ab-Preis kein "m2" im Markup).
- `/collections/teppiche`: Karte "ab 197,80 EUR z. B. 80 x 150 cm", 0 sichtbare m2-Angaben im Hauptbereich.
- PDP woolara: "ab 227,80 EUR z. B. 80 x 150 cm", Konfigurator 80 x 150 = 227,80 EUR. Einzige verbleibende m2-Angabe: Satz in der Produktbeschreibung (S-22, Produktdaten).

## 2026-09-20 - Livegang PRs #398 + #399 (Commit ddc1ad4)
- Preview komplett PASS. Live: 24 Karten mit ab-Preis, 0 m2-Angaben im ab-Preis-Markup, Beispielmass steht.

## 2026-09-20 - S-23 Karte Variante A + S-24 Breite vom Teppichboden (Scratch-Theme)
- Unit: `tp-teppich-ab-preis` 17/17 (neu: Qualitaetszeile vom Teppichboden, ohne Daten keine Zeile, PDP ohne Zeile), `tp-teppich-max-breite` 6/6 (500er Rolle, je Farbe, nicht verfuegbare Rolle, Cover -10, Rueckfall, unbekannte Farbe). `npm test` gruen, static PASS.
- Karte mobil 375 (vermessen): Qualitaet 13 px einzeilig, Preis 24 px, Beispielmass 12 px, Marke 239 x 27, Knopf 343 x 44, Reihenfolge stimmt, kein horizontales Scrollen. 24/24 Karten mit Qualitaetszeile; Breiten "bis 500 x 600" und "bis 400 x 600" (rivena).
- Konfigurator woolara (500): Grenze "bis 500 x 600 cm", 450 x 450 = 2.711,25 EUR kaufbar, 520 x 520 abgelehnt, 80 x 150 = 227,80 EUR = Kartenpreis. rivena (400): 450 x 450 abgelehnt mit "Eine Seite darf hoechstens 400 cm messen". Hinweis: 520 x 300 ist zulaessig, weil nur die kurze Seite in die Rolle passen muss.
- PDP-Preis 30 px.
- Datenfix: 3 `fasermaterial`-Metaobjekte (Schurwolle, Polypropylen, Sisal) von Entwurf auf aktiv - danach erscheint z. B. "Schurwolle · Schlinge · 6 mm Flor".
- Nicht getestet: Screenshot (Browserfenster lieferte leere Bilder), Desktop-Optik, Farbwechsel mit unterschiedlicher Breite je Farbe (kein Produkt mit solcher Datenlage gefunden - nur Unit), Warenkorbzeile mit 500er Rolle.

## 2026-09-20 - Livegang PR #400 (Commit 9fddd3a)
- Preview komplett PASS im ersten Lauf. Live-HTML `/collections/teppiche`: 24 Qualitaetszeilen, 23x "bis 500", 1x "bis 400", z. B. "Schurwolle · Schlinge · 6 mm Flor".

## 2026-09-20 - S-22 Produkttexte (Produktdaten, kein Theme)
- Sonnet-Worker, Sicherung vor dem Schreiben geprueft: 50 Originale, alle mit altem Rechnerblock und m2 im SEO-Text.
- Eigene Gegenprobe ueber den oeffentlichen Shop (nicht ueber die Worker-Antwort): 49/49 Beschreibungen mit "So bestellen Sie", 0 Rueckstaende (EUR/m2, "je laufendem Meter", alter Block), Masse 44x 500 x 600 und 5x 400 x 600, kein Text widerspricht der Wunschmass-Marke seiner Karte, keine widerspruechlichen Masse innerhalb eines Textes.
- Meta-Descriptions live: 49/49 ohne m2-Preis und ohne "ab 99", alle <= 160 Zeichen. rubira wich im Format ab (eine Farbe) und wurde von Hand nachgezogen.
- Nicht geprueft: Darstellung der neuen Liste im Layout (reines HTML-Listenformat wie vorher), das 50. gesicherte Produkt liegt nicht in der Kollektion teppiche.
