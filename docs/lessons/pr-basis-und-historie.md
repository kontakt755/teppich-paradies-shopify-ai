# Ein PR, der gegen `main` sauber ist, kann trotzdem nie geprueft werden

**Regel:** `npm run pr:doctor` nach jedem Merge nach `main`, `--fix` fuer alles,
was ohne Urteil geht. Gestapelte PRs vor dem Merge ihrer Basis umzielen.
Inhaltskonflikte in einem Wegwerf-Worktree loesen, nie im geteilten Checkout.

## Regeltext (bis 2026-10-16 in AGENTS.md, Punkt 9)

**9. Ein PR, der gegen `main` sauber ist, kann trotzdem nie geprueft werden.**
Falsche Basis, geloeschte Basis, ueberkreuzte Historie — alle mechanisch, und
jeder Merge nach `main` erzeugt neue Konflikte in anderen PRs.

```
npm run pr:doctor              # alle offenen PRs: Basis, Merge-Basen, Konflikte, Checks
npm run pr:doctor -- --fix     # umzielen auf main, ueberkreuzte Historie begradigen
```

Nach jedem Merge neu rechnen. `--fix` erledigt nur, was ohne Urteil geht;
Inhaltskonflikte in einem Wegwerf-Worktree loesen, nie im geteilten Checkout.
Gestapelte PRs **vor** dem Merge ihrer Basis umzielen. Die CI meldet nur
(`pr-doctor.yml`, `npm run pr:doctor:melden`), repariert bewusst nicht.

## Drei Faelle aus einer Woche (2026-09-09 bis -15)

Alle von Hand geloest, alle mechanisch:

| Fall | Symptom | Ursache |
|---|---|---|
| gestapelter PR (#280) | „MERGEABLE/CLEAN" ohne einen einzigen Check | Basis war nicht `main`; der Validierungs-Workflow feuert nur gegen `main` |
| Basis geloescht (#280) | PR ploetzlich **geschlossen** | `--delete-branch` beim Merge der Basis schliesst gestapelte PRs, statt sie umzuzielen; ein geschlossener PR nimmt keine neue Basis mehr an |
| ueberkreuzte Historie (#328) | GitHub „dirty" ohne `merge_commit_sha`, obwohl `git merge` sauber laeuft | mehrere Merge-Basen (`git merge-base --all`); ohne Merge-Ref startet kein `pull_request`-Workflow |

Dazu kommt: jeder Merge nach `main` erzeugt neue Konflikte in anderen PRs
(#285 → vier PRs, #236 + #320 → zwei). Deshalb nach jedem Merge neu rechnen,
nie eine Stichprobe.

## Was `--fix` tut und was nicht

`--fix` zielt auf `main` um und begradigt ueberkreuzte Historie. Echte
Inhaltskonflikte bleiben ein Befund. Hat `main` eine Datei als toten Code
entfernt und der Branch sie nur kosmetisch angefasst, gilt die Loeschung.

## Warum die CI nur meldet und nicht repariert

`.github/workflows/pr-doctor.yml` laeuft bei jedem Push auf `main` und alle
sechs Stunden, mit einem idempotenten Kommentar am betroffenen PR
(`npm run pr:doctor:melden`, Marker `<!-- tp-pr-doctor -->`; gleicher Befund
wird nicht doppelt gepostet, ein wieder sauberer PR bekommt eine Entwarnung).
Aenderungen mit dem Workflow-Token loesen auf GitHub keine weiteren Workflows
aus — ein Begradigen aus der CI wuerde also genau die PR-Validierung nicht
starten, die es erreichen soll. Reparieren tut eine Sitzung mit `--fix`.

## GitHub wertet Merge-Treiber nicht aus (Befund 2026-10-29)

**Befund:** Seit PR #1767 (28.10.) stand in `.gitattributes`
`docs/control-center/CHANGELOG.md merge=union`, damit parallele PRs ihren Eintrag oben in
dieselbe Datei schreiben koennen. Lokal merged git damit sauber. GitHub rechnet die
Mergebarkeit aber ohne Merge-Treiber: nach jedem Merge nach `main` standen alle anderen
offenen PRs mit Changelog-Eintrag als CONFLICTING, `pr-validation.yml` startete nicht, und
eine Sitzung zog `origin/main` von Hand in jeden Branch - am 29.10. zweimal fuer sechs PRs,
27 Nachzieh-Merges an einem Tag.

**Beleg:** `git merge-tree --write-tree origin/main origin/<branch>` war wegen `union`
blind (sauber), `npm run pr:doctor` meldete deshalb nichts. Die Sicht von GitHub liefert
`git --attr-source=<Commit vor #1767> merge-tree --write-tree origin/main origin/<branch>`:
Konflikt in `CHANGELOG.md`, bei 6 von 7 offenen PRs.

**Folge (PR Changelog-Einzeldateien, 29.10.):** Ein Eintrag = eine Datei unter
`docs/control-center/changelog/` (`JJJJ-MM-TT-<kurzname>.md`, Format in der README dort),
`CHANGELOG.md` eingefroren, `merge=union` entfernt, damit `pr:doctor` wieder sieht, was
GitHub sieht. `npm run changelog:guard` prueft Dateiname, Kopfzeile, Pflichtabschnitte und
dass die alte Datei keine Ueberschrift nach dem Einfrierdatum bekommt; er laeuft in
`npm run -s pruefen` und damit in der CI. `pr:doctor` uebernimmt zusaetzlich `mergeable`
und `mergeStateStatus` von GitHub und meldet einen Konflikt auch dann, wenn der lokale
`merge-tree` sauber ist; ein PR, der noch in `CHANGELOG.md` schreibt, bekommt eine Warnung.

**Regel daraus:** Ein Merge-Treiber in `.gitattributes` loest nie ein Konfliktproblem auf
GitHub. Wenn viele Branches dieselbe Stelle einer Datei aendern muessen, hilft nur eine
Struktur ohne gemeinsame Zeile - eine Datei je Eintrag.
