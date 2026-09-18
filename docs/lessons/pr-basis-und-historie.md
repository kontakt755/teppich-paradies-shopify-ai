# Ein PR, der gegen `main` sauber ist, kann trotzdem nie geprueft werden

**Regel:** `npm run pr:doctor` nach jedem Merge nach `main`, `--fix` fuer alles,
was ohne Urteil geht. Gestapelte PRs vor dem Merge ihrer Basis umzielen.
Inhaltskonflikte in einem Wegwerf-Worktree loesen, nie im geteilten Checkout.

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
