# Änderungen

## 2026-09-22 · Navigation · Bildkacheln Teppichfliesen

- **Problem vorher:** Menüpunkt Teppichfliesen ohne kuratierte Kacheln. Desktop: quadratisches Kollektionsbild und ein hochkantes Produktfoto (Teppichplanken) im 16:9-Ausschnitt; Drawer: Kollektionsbild.
- **Änderung:** vier `_tp-menu-kachel`-Blöcke (Teppichfliesen, Alle Teppichfliesen, Fliesen 50 × 50 cm, Teppichplanken) mit echten Produktfotos aus der Kollektion.
- **Dateien:** `sections/header-group.json`
- **Auswirkungen:** nur Bilder im Menü; Menüstruktur unverändert (Datei war vor dem Push identisch mit `main`, MD5 705b2682…).
- **Risiken:** Bildkachel zeigt eine Planke (Sigmavia) als Hero für „Alle Teppichfliesen" – Produkt ist Teil der Kollektion, kein KI-Bild.
- **Test:** Guards grün; Push `--only` ins Arbeitstheme, `checksumMd5` 21087b1c… = lokal; Vorschau Desktop + Mobil.
- **Ergebnis:** PR #454.
