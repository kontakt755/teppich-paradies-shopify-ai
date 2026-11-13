## 2026-11-13 · Ausschreibungen: kleine und nahe Aufträge zuerst

- **Geaendert:** Die Liste „Öffentliche Ausschreibungen“ (Ansicht „Neue Aufträge“) und der Wochenlauf zeigen kleine Verfahren vor EU-Verfahren, darin Orte mit PLZ 16… (Oberhavel, Barnim, Ruppin) vor dem Rest, dann nach Frist. Eine Vergleichsfunktion (`kleineZuerst` in `lib/akquise.mjs`) für beide Stellen; der Hinweistext nennt die Reihenfolge. Das To-do auf „Heute“ nennt weiter die nächste Frist.
- **Getestet:** `operations/tests/ausschreibungen.test.mjs` (neuer Fall Reihenfolge), `npm run dashboard:test`, `npm run -s pruefen`, `npm run dashboard:pruefen`, Reihenfolge mit dem letzten echten Stand (6 Treffer) angesehen.
- **Risiken/Annahmen:** „Groß“ heißt Quelle TED oder „EU“ in der Verfahrensart, „nah“ heißt PLZ 16… im Ortsfeld; ein Ort ohne PLZ zählt als nicht nah. Auftragswerte nennen die Feeds fast nie, sie fließen deshalb nicht ein. Ein EU-Verfahren mit naher Frist steht jetzt unten in der Liste, die Ampel zeigt die Frist weiter an.
- **Nächste Stufe:** Menge aus der Losbeschreibung (m²) auswerten, sobald genug Treffer sie nennen.
