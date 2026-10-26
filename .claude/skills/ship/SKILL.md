---
name: ship
description: Einen fertigen Pull Request nach main bringen und bei Bedarf ausrollen - Aenderungen ansehen, bei kritischen Aenderungen Codex-Review, CI gruen, Deploy-Fenster frei, Merge-Commit, pr:doctor, danach Theme- oder Dashboard-Deploy und die eigene Arbeitskopie entfernen. Verwenden bei "/ship <PR-Nummer>", "merge <PR-Nummer>", "PR mergen", "PR mergen und ausrollen". Der Aufruf ist die ausdrueckliche Freigabe, genau diesen PR zu mergen und, wenn noetig, zu deployen.
---

# PR mergen und ausrollen (`/ship <PR-Nummer>`)

Der Aufruf ist die ausdrueckliche Freigabe des Benutzers, **genau diesen** PR
zu mergen und, falls er Theme oder Dashboard aendert, auszurollen. Fuer nichts
anderes: keine weiteren PRs, keine fremden Branches. Fehlt die Nummer,
nachfragen statt raten.

Jeder Schritt wird mit der Ausgabe seines Befehls belegt. Bricht ein Schritt
ab, ist das ein Befund: Ursache beheben oder melden, nie ueberspringen, nie
einen Guard oder Hook umgehen.

## 1. Was aendert sich?

```
gh pr view <PR> --json files,title,headRefName,baseRefName,state,isDraft \
  --jq '{title,headRefName,baseRefName,state,isDraft,files:[.files[].path]}'
```

- `state` muss `OPEN` sein und `baseRefName` `main` - gegen eine andere Basis
  laeuft keine PR-Validierung (`docs/lessons/pr-basis-und-historie.md`).
- Arbeitet noch jemand auf dem Branch? `git worktree list | grep "\[<headRefName>\]"`;
  meldet `git -C <pfad> status --porcelain` dort uncommittete Aenderungen, ist
  die Arbeit nicht fertig: nicht mergen, melden.
- Entwurf (`isDraft: true`): nach dieser Pruefung mit `gh pr ready <PR>` freigeben.

## 2. Kritisch? Dann Codex-Review

Kritisch sind nach `AGENTS.md` („Gedaechtnis, Uebergaben und Review“) Preise,
SKUs, Varianten, Massenimporte, Checkout und die Deploy-Kette. Anhaltspunkte in
der Dateiliste: Pfade mit `"risk": "HIGH"` in `domains/shopify/risk-map.json`,
Preis- und Warenkorblogik (Skill `preislogik`), `workflow/`, `deploy.sh`, die
Deploy-Guards in `.claude/hooks/`. Im Zweifel kritisch.

```
npm run -s ki:frag -- review <PR>        # an den Head-Commit gebunden, lange Laeufe im Hintergrund
npm run -s ki:frag -- review-stand <PR>  # muss "Review aktuell: ..." melden (Exit 0)
```

- `offen` (P1): auf dem PR-Branch beheben (wie in Schritt 3) und neu pruefen
  lassen; haelt Claude den P1 fuer falsch, entscheidet der Benutzer.
- `veraltet`: seit dem Review kam ein Commit dazu - neues `review`.
- Hoechstens drei Runden. Exit 3 (Kontingent erschoepft): nicht wiederholen,
  nicht mergen, dem Benutzer melden.
- Hat Codex den PR umgesetzt („Umgesetzt von Codex, geprueft von Claude“),
  prueft Claude mit `/code-review` statt Codex am eigenen Ergebnis.

Details: Skill `codex`, Abschnitt „PR-Review mit festem Pruefgegenstand“.

## 3. CI gruen

```
gh pr checks <PR>     # Exit 0 = alles gruen, 8 = laeuft noch, 1 = rot
```

- Laeuft noch: im Hintergrund warten (`run_in_background`) mit
  `gh pr checks <PR> --watch --fail-fast` - kein `sleep`.
- Rot: `gh run view <run-id> --log-failed` lesen und auf dem PR-Branch beheben,
  in dessen Arbeitskopie (Schritt 1) oder einer frischen
  (`git -C <hauptcheckout> worktree add .claude/worktrees/<thema> <headRefName>`,
  Hauptcheckout = erste Zeile von `git worktree list`): `npm run -s pruefen`, Dateien einzeln stagen, committen, pushen. Danach
  wieder ab Schritt 2 - jeder neue Commit macht ein Review veraltet.
- Gar keine Checks: Basis pruefen (Schritt 1), `npm run -s pr:doctor`.

## 4. Deploy-Fenster frei

```
npm run -s deploy:frei     # "FREI: ..." Exit 0, "BELEGT: ..." Exit 1
```

Bei `BELEGT` warten, bis Live durch ist - im Hintergrund
(`run_in_background`), etwa `until npm run -s deploy:frei; do sleep 60; done`,
nie mit `sleep` im Vordergrund. Ein Fenster verfaellt nach spaetestens 60
Minuten. Den fremden Deploy nicht abbrechen, seine `.workflow/deploy-fenster.json`
nicht loeschen und `.claude/hooks/git-gh-guard.mjs` (sperrt `gh pr merge`
waehrend eines Deploys) nicht umgehen. Hintergrund: Skill `deploy`,
Abschnitt Deploy-Fenster.

## 5. Mergen

```
gh pr merge <PR> --merge
gh pr view <PR> --json state,mergeCommit --jq '{state, commit: .mergeCommit.oid}'   # MERGED + Commit
```

Merge-Commit, kein Squash oder Rebase. Kein `--delete-branch`: Branches
bleiben (`AGENTS.md`, „Arbeitskopien“). Kein `--admin`. Meldet GitHub einen
Konflikt mit `main`: `origin/main` in den PR-Branch mergen, Konflikt dort loesen
(Schritt 3), dann ab Schritt 2.

## 6. Andere PRs nachrechnen

```
npm run -s pr:doctor     # Exit 1 = in anderen PRs bleiben Konflikte offen
```

Pflicht nach jedem Merge (`AGENTS.md` Punkt 9). Konflikte in PRs anderer
Sitzungen nur melden (PR-Nummer, Dateien), nicht loesen und deren Branches
nicht anfassen. `-- --fix` erledigt nur das Mechanische ohne Inhaltsurteil
(auf `main` umzielen, ueberkreuzte Historie begradigen).

## 7. Ausrollen

Entscheidend ist die Dateiliste aus Schritt 1; trifft beides zu, beides.

- **Theme** (`assets/`, `blocks/`, `config/`, `layout/`, `locales/`,
  `sections/`, `snippets/`, `templates/` - `THEME_PATHS` in `workflow/core.mjs`):
  Skill `deploy`. Nur im Deploy-Worktree auf `main`
  (`git worktree list | grep '\[main\]'`, dort `git pull --ff-only`), nie im
  Hauptcheckout oder in dieser Arbeitskopie: `npm run workflow:doctor`,
  Preview, Live. Danach den oeffentlichen Shop ohne Preview-Parameter pruefen
  (`AGENTS.md`, „Grundsaetzliche Arbeitsweise“).
- **Dashboard** (`docs/ai-dashboard/`, `operations/`, `social/`,
  `scripts/serve-dashboard.mjs`, `scripts/dashboard-api.mjs`): Skill
  `control-center`, Schritt 9 - `origin/main` in `~/tp-dashboard` (Branch
  `dashboard-betrieb`) mergen, testen, Dienst neu starten, pruefen.
- **Nur anderes** (Skills, Doku, Skripte, Tests, Hooks): nichts auszurollen.
  Den Hauptcheckout zieht der naechste Sitzungsstart nach
  (`.claude/hooks/hauptcheckout-nachziehen.sh`).

## 8. Aufraeumen und berichten

Die eigene Arbeitskopie (Branch = PR-Branch, von dieser Sitzung angelegt)
entfernen, wenn sie sauber und gemergt ist:

```
git fetch origin
git status --porcelain                                   # leer
git merge-base --is-ancestor HEAD origin/main && echo gemergt
git -C <hauptcheckout> worktree remove <pfad>            # Branch bleibt
```

`git worktree remove` loescht ignorierte Dateien (`node_modules`, `.workflow/`)
ohne Rueckfrage mit. Fremde Arbeitskopien bleiben; gemergte zeigt
`npm run -s worktrees:aufraeumen` (entfernt erst mit `-- --entfernen` und nach
24 h Ruhe, die eigene nie).

Bericht, kurz (`AGENTS.md`, „Kommunikation“): Merge-Commit (kurzer SHA),
Checks, Review-Stand bei kritischen PRs, Ergebnis von `pr:doctor`, was
ausgerollt wurde (Theme: Preview und Live, Dashboard: Dienst neu gestartet)
oder warum nichts.
