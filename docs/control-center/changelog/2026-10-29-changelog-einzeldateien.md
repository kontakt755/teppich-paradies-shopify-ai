## 2026-10-29 · Changelog als Einzeldateien – Merge-Konflikte am Control-Center-Changelog abgeschafft

- **Geaendert:** Jeder PR schrieb seinen Eintrag oben in `docs/control-center/CHANGELOG.md`. Lokal
  löste `merge=union` (PR #1767) das auf, GitHub wertet Merge-Treiber aber nicht aus: nach jedem Merge
  nach `main` standen alle anderen offenen PRs mit Eintrag als CONFLICTING, `pr-validation.yml`
  startete nicht, und eine Sitzung zog `origin/main` von Hand in jeden Branch (am 29.10. zweimal für
  6 PRs, 27 Nachzieh-Merges). Jetzt: ein Eintrag = eine Datei `changelog/JJJJ-MM-TT-<kurzname>.md`
  (Format in `changelog/README.md`), `CHANGELOG.md` eingefroren mit Hinweis oben, `merge=union` aus
  `.gitattributes` entfernt (damit `pr:doctor` wieder sieht, was GitHub sieht). Neuer Guard
  `npm run changelog:guard` (Dateiname, Kopfzeile mit Datum, Pflichtabschnitte, keine Überschrift
  nach dem Einfrierdatum in der alten Datei) als Schritt in `npm run -s pruefen`; `npm run -s changelog`
  zeigt die letzten Einträge. `pr:doctor` übernimmt `mergeable`/`mergeStateStatus` von GitHub und
  meldet einen Konflikt auch dann, wenn der lokale `merge-tree` sauber ist, und warnt, wenn ein PR noch
  in `CHANGELOG.md` schreibt. Skill `control-center`, Agent, Werkzeuge-Skill, BESTANDSAUFNAHME und
  `docs/lessons/pr-basis-und-historie.md` nachgezogen.
- **Getestet:** `qa/tests/changelog-guard.test.mjs` neu (Dateiname, Kopfzeile, Abschnitte, Einfrierdatum,
  Lesebefehl, CLI, Repository selbst), `qa/tests/pr-doctor.test.mjs` erweitert (GitHub CONFLICTING bei
  sauberem merge-tree, Changelog-Warnung), `npm run -s pruefen` alle 10 Schritte grün (tests 43 s, python,
  liquid, schema, template, theme, schrift, changelog, themecheck, secrets); `npm run -s pr:doctor` lesend:
  #1794 jetzt lokal wie bei GitHub als Konflikt in `CHANGELOG.md` plus Warnung `changelog-datei`; Merge-Probe
  dieses Branches gegen die drei offenen Branches sauber.
- **Risiken/Annahmen:** Dieser PR wird als letzter nach den offenen Changelog-PRs gemergt. Branches aus
  älteren Arbeitskopien, die danach noch in `CHANGELOG.md` schreiben, scheitern am Guard in der CI und
  verschieben ihren Eintrag in eine Datei; ein Eintrag mit Datum 2026-10-29 in der alten Datei besteht
  den Guard noch, erzeugt aber wieder einen Konflikt – `pr:doctor` warnt davor.
- **Nächste Stufe:** keine.
