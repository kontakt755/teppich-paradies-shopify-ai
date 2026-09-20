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
