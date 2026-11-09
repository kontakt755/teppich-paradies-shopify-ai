## 2026-11-09 · Kettelpuffer: Nachweis für mehrere Stücke und gemischte Kettelwege

- **Geaendert:** Keine Logik. Die +3-cm-Regel (#1684) steht seit PR #1814 zentral in
  `operations/lib/kettelpuffer.mjs`. Zwei Tests in `operations/tests/lieferanten.test.mjs` kommen
  dazu: zwei gleiche Stücke 180 × 250 werden je Stück als 183 × 253 bestellt (nicht addiert, nicht
  doppelt, auch beim wiederholten Erzeugen), und bei gemischter Wahl bekommt nur das Stück für
  unseren Kettler den Puffer, das vom Lieferanten gekettelte bleibt im Fertigmaß.
- **Getestet:** `node --test operations/tests/lieferanten.test.mjs` 77/77, `npm run -s pruefen`.
- **Risiken/Annahmen:** Keine; reine Testergänzung.
- **Nächste Stufe:** offen aus #1684 bleiben die Inhaberfragen zu Bändern und „Fertig eingefasst“.
