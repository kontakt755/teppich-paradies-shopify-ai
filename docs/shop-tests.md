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

Regressionen: keine gefunden. Nebenbefund: gequetschter MwSt-Text nur im Test-Theme, im Live-Theme nicht vorhanden.

## 2026-09-20 - Livegang S-01 + S-02 (Commit a0cbd07)
- `workflow preview`: COMPARE, SEO, FULL QA, SALES, alle Guards PASS.
- Preview-Theme und danach Live (`Shopify.theme.role = main`), Produkt `altessa-teppich-nach-mass`, Desktop:
  kein "Im Raum", kein "So rechnen wir", 200 x 300 ergibt 346,00 EUR, Masszeichnung da, Warenkorb-Button aktiv.
- Zwei 401-Konsolenmeldungen im Preview-Modus, nicht aus Theme-Dateien (alle Theme-Assets 200).
- Nicht getestet: Live mobil nach dem Rollentausch, echter Warenkorb-Eintrag.
