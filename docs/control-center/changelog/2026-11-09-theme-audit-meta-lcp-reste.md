## 2026-11-09 · Theme-Audit: saubere Suchtexte, leichteres Startseitenbild, Produktsprung auf Reste

- **Geaendert:** Ohne gepflegte SEO-Beschreibung lieferte Shopify 320 Zeichen mit verklebten Absätzen
  („ca. 12 mm.Altbestand … Ein kos“). Jetzt baut `snippets/meta-tags.liquid` den Text aus der
  Beschreibung, mit Leerzeichen an Absatzenden, endend an der Wortgrenze vor 156 Zeichen
  (`description`, `og:`, `twitter:`). Gepflegte SEO-Beschreibungen bleiben unverändert.
  Startseiten-Kacheln (`sections/tp-start-kategorien.liquid`): Zwischenbreiten 500/700, mobil lädt das
  LCP-Bild 74 statt 107 KB; die zweite große Kachel lädt mit niedriger Priorität.
  Reste-Seite (`templates/collection.sonderposten.json`): „Direkt zu den Produkten ↓“ unter der
  Überschrift, nur mobil, wie bei Teppichboden.
- **Getestet:** `qa/tests/meta-folgeseiten-richtlinien.test.mjs` (14 Fälle), Arbeitstheme per `--only`:
  Restrolle, Piumera, Reste, Teppichboden, Teppich nach Maß, Startseite; Telefon 390 px und 412 px,
  Desktop 1440 px. Lighthouse vorher/nachher im Bericht `docs/audits/theme-audit-2026-11-09.md`.
- **Risiken/Annahmen:** Erkennung „keine SEO-Beschreibung“ über `global.description_tag`.
- **Nächste Stufe:** SEO-Titel der Reste-Kollektion im Admin pflegen; Mega-Menü mobil nachladen.
