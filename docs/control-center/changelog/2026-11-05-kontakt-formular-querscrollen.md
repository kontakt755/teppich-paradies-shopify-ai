## 2026-11-05 · Verlegeseiten: kein seitliches Schieben mehr nach dem Sprung zum Formular

- **Geaendert:** Am Telefon ragte die Anfragekarte nach dem Klick auf „Verlegung anfragen“ 7–8 px über den rechten Rand, die ganze Seite ließ sich seitlich schieben. Ursache war nicht die Navigationsleiste, sondern die Auswahl „Ich möchte“: Ein `select` ist so breit wie seine längste Option, und die Rasterspalten mit nacktem `1fr` in `sections/tp-start-kontakt.liquid` wuchsen mit. Vor dem Klick ist das Formular eingeklappt, deshalb trat der Überstand erst nach dem Sprung auf. Die Raster nutzen jetzt `minmax(0, 1fr)`, die Formularfelder `width: 100%` und `min-width: 0`.
- **Getestet:** `npm run -s pruefen` grün mit neuem `qa/tests/tp-start-kontakt-breite.test.mjs`; im eigenen Development-Theme alle fünf Verlegeseiten bei 390 und 1366 px vor und nach dem Sprung gemessen (Überstand 0 px).
- **Risiken/Annahmen:** Die Section liegt auch auf der Startseite und weiteren Seiten; dort ändert sich nur, dass die Felder nicht mehr über ihre Spalte hinauswachsen können.
- **Nächste Stufe:** keine.
