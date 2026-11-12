## 2026-11-12 · Versandschätzung im Bestelldialog rechnet auch Großstadt-Ziele und schwere Aufträge

- **Geaendert:** Liegen Abholort (Kettler) und Ziel beide in einer Metropole der Spedition, nannte die Schätzung keinen Preis, weil offen ist, ob der Zuschlag ein- oder zweimal fällt. Sie rechnet jetzt mit dem teureren Fall (zweimal). Sind mehrere Teppiche zusammen als ein Packstück gesperrt (privat ab 60 kg), rechnet die Gegenrechnung „Wer kettelt?“ sie einzeln, statt keine Empfehlung zu geben.
- **Getestet:** `operations/tests/bestellwarnung.test.mjs` (2 neue Tests; der Metropolen-Test scheitert ohne die Änderung), Probe mit den echten hinterlegten Kosten für ein Ziel in Köln: vorher bei vier von sieben Fällen keine Empfehlung, jetzt bei allen sieben. `npm run -s pruefen`.
- **Risiken/Annahmen:** Der doppelte Zuschlag kann den eigenen Weg um den einfachen Zuschlag zu teuer zeigen. Die Frage an die Spedition (ein- oder zweimal) ist weiter offen. Nur die Schätzung im Bestelldialog ist betroffen, der Versandrechner für echte Packstücke verlangt die Klärung wie bisher.
- **Nächste Stufe:** Antwort der Spedition eintragen, sobald sie vorliegt.
