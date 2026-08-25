# Status des AI-Arbeitsablaufs

**Stand: 25. August 2026**

Dieses Dokument erklärt in einfachen Worten, wo der AI-Arbeitsablauf gerade
steht. Er wird für den produktiven Einsatz vorbereitet und läuft in vier
Schritten ab: **Router → Orchestrator → AI-Provider → Review**. Während dieser
Vorbereitung wurden keine Änderungen im Live-Shop veröffentlicht, keine
Commits erstellt und nichts gepusht.

## Was das System heute schon kann

- Es schätzt ein, wie riskant eine Aufgabe ist, und wählt dafür den passenden
  Agenten aus.
- Es legt vorher genau fest, welche Dateien der Agent bearbeiten darf.
- Es führt die erlaubten Änderungen aus und startet danach automatisch die
  passenden Tests.
- Bei Bedarf prüft ein zweiter, unabhängiger Reviewer ausschließlich die
  neuen Änderungen – nicht das ganze Projekt.
- Bei normalen Code-Aufgaben (Klasse B) prüft zuerst ein kostengünstiger
  Cloud-Reviewer (Nemotron) vor – nur bei einem Fund, einem Ausfall oder bei
  Dateien mit Geld-/CI-/Orchestrator-Bezug läuft zusätzlich Codex.
- Findet der Reviewer ein wichtiges Problem, kann das System eine begrenzte
  Korrekturrunde starten.
- Änderungen, die schon vorher – zum Beispiel von jemand anderem – im
  Arbeitsverzeichnis lagen, werden sauber von den neuen Agenten-Änderungen
  getrennt.
- Bricht ein Lauf ab, prüft das System danach, ob es gefahrlos weitermachen
  kann, statt einfach fortzufahren.

## Was das System nicht darf

- Es darf nicht selbst im Shopify-Shop etwas schreiben oder verändern.
- Es darf kein Theme veröffentlichen.
- Es darf keinen Pull Request erstellen, keinen Code pushen und keine
  Branches zusammenführen (mergen).
- Es darf keine unklaren oder nicht eindeutig zuordenbaren Änderungen einfach
  übernehmen.
- Es darf sich keine Sicherheitsfreigabe selbst erteilen.
- Bei Rate-Limits sowie Anmelde- oder Netzwerkfehlern darf es nicht
  automatisch zu einem anderen AI-Provider wechseln.

Diese Schritte bleiben bewusst bei Ahmet.

## So läuft eine Aufgabe Schritt für Schritt ab

```text
Ahmet (CLI)
  │  npm run ai:route -- "Aufgabe"
  ▼
Router (workflow/router.mjs)          – ordnet die Aufgabe in Klasse A–D ein
                                        und wählt Implementer und Reviewer
  ▼
Orchestrator (workflow/ai-control.mjs + ai-control-core.mjs)
  │  nutzt automation/core/runner.mjs für Sperre, Statusspeicher,
  │  Risikoschutz und Review-Zyklus
  ▼
Diff-Scope (workflow/diff-scope.mjs)  – trennt neue Agentenänderungen von
                                        bereits vorhandenen Änderungen
  ▼
Provider-Adapter (workflow/providers/) – startet Claude Code oder Codex
                                         ohne interaktive Eingaben
  ▼
Review-Zyklus (automation/core/review-cycle.mjs)
  │  Umsetzen → Prüfen → Korrigieren, höchstens 3 Runden
  ▼
Freigabe durch Ahmet                  – nötig für Shopify-Write,
                                        Veröffentlichung, Push und Merge
```

Wichtig zu wissen: Der Router gibt nur eine Empfehlung ab. Er entscheidet
noch nichts. Erst der Orchestrator startet die Agenten wirklich und führt die
Aufgabe bis zur nächsten notwendigen Freigabe weiter. Weitere Einzelheiten
stehen in `docs/AI_ROUTER.md` und `docs/AI_CONTROL.md`.

## Was die einzelnen Bausteine tun

Der Orchestrator besteht aus zwei Dateien: `workflow/ai-control.mjs` und
`workflow/ai-control-core.mjs`. Zusammen mit dem Router und dem Runner
steuern sie den gesamten Ablauf:

- **Aufgabe einordnen (`ai:route`):** Sortiert die Aufgabe in eine von vier
  Risikoklassen (A bis D) ein und legt fest, welche Dateien und Aktionen
  erlaubt sind. Ein alter Laufstatus derselben Task-ID wird dabei
  zurückgesetzt.
- **Automatisch weiterarbeiten (`ai:continue`):** Durchläuft die Schritte
  Implementer → Prüfung → Reviewer → gegebenenfalls Korrektur → Fertig. Ein
  Lauf endet spätestens nach 12 Durchgängen. Wiederholt sich eine Aktion
  ohne erkennbaren Fortschritt, greift ein Schutz gegen Endlosschleifen.
- **Änderungen auseinanderhalten (`workflow/diff-scope.mjs`):** Mit dem
  Schalter `--allow-dirty` unterscheidet das System die Änderungen des
  aktuellen Laufs von älteren, fremden Änderungen im Arbeitsverzeichnis. Der
  Reviewer bekommt ausschließlich den Diff des aktuellen Agenten zu sehen.
- **AI-Provider starten (`workflow/providers/`):** Claude Code wird mit der
  Option `--print` gestartet, die Codex-CLI mit `exec`. Beide laufen ohne
  interaktive Eingaben und mit eng begrenzten Rechten. Vor jedem Lauf prüft
  das System, ob der jeweilige Provider überhaupt erreichbar ist. Bei
  Rate-Limit-, Anmelde- oder Netzwerkfehlern wechselt es dabei nicht
  automatisch den Provider.
- **Review durchführen:** Es gibt höchstens drei Prüfrunden. Ein schwerwiegender
  Befund (P0) stoppt den Lauf sofort. Ein wichtiger Befund (P1) führt zu genau
  einer Korrektur und einem zweiten Review. Danach endet der Ablauf mit dem
  Status `REVIEW_LIMIT_REACHED`.
- **Nach einem Abbruch fortsetzen (`ai:resume`):** Bewertet einen
  abgebrochenen Lauf. Ist die Lage unklar – zum Beispiel nach einem
  Branch-Wechsel, einem veränderten Commit-Stand oder bei einer bestehenden
  Sperre – lautet das Ergebnis immer `NEEDS_AHMET`. Das System setzt dann
  nichts automatisch fort, sondern wartet auf eine menschliche Entscheidung.
- **Meldungen verständlich erklären (`workflow/plain-language.mjs`):** Übersetzt
  jeden Stoppgrund und jede Aktion zusätzlich in einen allgemein
  verständlichen Satz, damit auch ohne Entwickler-Hintergrund klar ist, was
  gerade passiert.

## Wer welche Aufgabe übernimmt (Rollen)

Das System unterscheidet zwei Dinge: die **Router-Rolle** legt fest, welcher
Provider und welches Modell zum Einsatz kommt. Die **Agenten-Phase** legt
fest, was der Agent in diesem Durchgang überhaupt tun darf.

| Router-Rolle | Provider | Aufgabe |
|---|---|---|
| `SCRIPT` | – (feste Regeln, keine KI) | Führt feste Prüf- oder Build-Skripte aus, ganz ohne AI-Agenten |
| `HUMAN` | – | Übergibt die Entscheidung direkt an Ahmet |
| `CLAUDE_HAIKU` | Claude Code (Haiku) | Kostengünstiger Standard-Implementer für Klasse B |
| `CLAUDE_SONNET` / `CLAUDE_STRONG` | Claude Code | Implementiert komplexe beziehungsweise kritische Aufgaben der Klassen C und D |
| `CODEX_LIGHT` / `CODEX_MEDIUM` | Codex CLI | Unabhängiger Reviewer für sensible Änderungen; nicht mehr der Standard-Implementer |
| `NEMOTRON_REVIEW` | NVIDIA Nemotron (Cloud-API, kein CLI) | Nur READ_ONLY. Standard-Erstpass vor Codex bei Klasse B: ein sauberes PASS auf reinem Theme-Markup ersetzt Codex vollständig, jeder Fund/Ausfall/jede Geld-/CI-/Orchestrator-Datei eskaliert an `CODEX_LIGHT` (siehe `docs/AI_ROUTER.md`) |

| Agenten-Phase | Rechte | Aufgabe |
|---|---|---|
| **Router** | – | Ordnet die Aufgabe ein, wählt Implementer und Reviewer und legt fest, welche Dateien erlaubt sind |
| **Implementer** | Schreibend, aber mit eng begrenzten Werkzeugen (`Edit`, `Write`, kein Bash, kein Netzwerk) | Setzt die Aufgabe nur innerhalb der erlaubten Dateien um |
| **Reviewer** | Nur lesend (Planmodus bzw. `--sandbox read-only`) | Prüft ausschließlich den Diff des aktuellen Agenten und meldet Befunde in drei Stufen: P0, P1 oder P2 |
| **Corrector** | Schreibend, mit denselben Grenzen wie der Implementer | Korrigiert einen bestätigten P1-Befund, innerhalb von höchstens drei Review-Runden |

Der Reviewer bekommt nie Schreibrechte. Der Corrector startet nur nach einem
bestätigten P1-Befund und nur dann, wenn für genau diesen Lauf ein gültiges
Reviewer-Ergebnis vorliegt.

## Wie Shop und Repository geschützt werden

- **Shopify bleibt schreibgeschützt:** Im Code verhindert
  `SHOPIFY_WRITES_MUST_REMAIN_DISABLED` jeden Versuch, den Schreibzugriff über
  `SHOPIFY_WRITE_ENABLED=true` einzuschalten. Zusätzlich weist
  `assertReadOnlyDocument` schreibende GraphQL-Anfragen (Mutationen) schon im
  Client per Prüfung zurück.
- **Nur erlaubte Dateien und Aktionen:** Riskante Aktionen wie Shopify-Write,
  Veröffentlichen, Push und Merge stehen niemals in der Liste der erlaubten
  Operationen. Sie bleiben ausschließlich menschlichen Freigaben vorbehalten.
- **Eindeutige Zuordnung jeder Änderung:** Kann eine Änderung nicht eindeutig
  zugeordnet werden, stoppt der Lauf. Das gilt für nicht angegebene Dateien,
  Dateien außerhalb der erlaubten Liste und einen während des Laufs
  veränderten Commit-Stand.
- **Schutz vorhandener Änderungen:** Ein schreibender Lauf startet bei einem
  nicht sauberen Arbeitsverzeichnis nur, wenn dies bewusst mit dem Schalter
  `--allow-dirty` bestätigt wurde. Das System führt niemals von sich aus
  Stash, Commit oder Reset aus.
- **Review-Nachweis gilt nur für genau einen Lauf:** Der Nachweis ist an
  Task-ID, Commit sowie einen Arbeitsverzeichnis- und Diff-Fingerabdruck
  gebunden – das sind technische Prüfsummen, die erkennen, ob sich seit dem
  Review noch etwas verändert hat. Ändert sich einer dieser Werte, gilt der
  Nachweis als veraltet (`stale`) und wird verworfen.
- **Geheimnisse werden aus Ergebnissen entfernt:** `workflow/agent-result.mjs`
  filtert bekannte Muster für Zugangsdaten aus Zusammenfassung, Ausgabe und
  Befunden heraus, bevor sie gespeichert werden. Dazu gehören Shopify-,
  OpenAI-, GitHub- und Slack-Tokens, JWTs sowie allgemeine `key=…`-Paare.
- **Kein automatischer Providerwechsel:** Bei 429-, Anmelde- oder
  Timeout-Fehlern bleibt der Provider unverändert. Ein Wechsel ist erst nach
  ausgeschöpften Versuchen bei einem echten fachlichen Fehler erlaubt, und
  auch dann nur, wenn der andere Provider nachweislich erreichbar ist.
- **Nur ein Lauf zur gleichen Zeit:** `automation/core/run-lock.mjs`
  verhindert mit einem `RunLockedError`, dass zwei Läufe gleichzeitig
  arbeiten. Eine verwaiste Sperre – also eine Sperre, deren Prozess gar nicht
  mehr läuft – wird nur entfernt, wenn dies nachweislich der Fall ist und der
  ausdrückliche Befehl `npm run ai:unlock -- --force` verwendet wird. Ohne
  `--force` zeigt `npm run ai:unlock` lediglich den aktuellen Zustand an.
- **Menschen erteilen die Freigaben:** Der Fertig-Zustand `PREPARE_DRAFT_PR`
  sowie jede Rolle ohne AI-Provider (`HUMAN`) stoppen den Ablauf. Das System
  erstellt keinen Pull Request und führt Shopify-Write, Theme-Veröffentlichung,
  Push oder Merge niemals von sich aus aus.
- **Shopify-Lesen und -Schreiben sind strikt getrennt:** `shopify/client.mjs`
  stellt nur die Funktion `graphqlReadOnly()` bereit. Jedes Dokument mit dem
  Schlüsselwort `mutation` wird schon vor dem Netzwerkaufruf durch
  `assertReadOnlyDocument` verworfen. Das gilt unabhängig von der
  zusätzlichen Sperre in `shopify/config.mjs`.
- **Secret-Scan für das ganze Repository:** `npm run secret:scan` läuft ohne
  Funde durch. Die Dateisuche verwendet
  `git ls-files --cached --others --exclude-standard` und erfasst dadurch
  auch neue, noch nicht committete Dateien.

## Was in dieser Version bewusst noch fehlt

- **Keine automatische Live-Veröffentlichung:** `PREPARE_DRAFT_PR` ist der
  Endzustand des Orchestrators. Den eigentlichen Draft-Pull-Request erstellt
  Ahmet selbst.
- **Keine ungeprüften Schreibänderungen:** Jede schreibende Aufgabe mit
  aktivierter Review-Pflicht muss vor dem Status `DONE` den Review-Zyklus
  durchlaufen. Aufgaben der Risikoklasse D brauchen immer ein Review und eine
  menschliche Freigabe.
- **Keine Shopify-Änderungen:** Shopify-Write sowie Änderungen an Themes,
  Produkten und Preisen sind in dieser Stufe weder für Agenten noch für den
  Orchestrator umgesetzt.
- **Keine unsichere automatische Fortsetzung:** Es gibt keinen automatischen
  Providerwechsel. Nach einem Absturz setzt `ai:resume` nur bei eindeutiger
  Lage fort. Im Zweifel liefert es immer `NEEDS_AHMET` – die Entscheidung
  bleibt dann bei Ahmet.

## Ergebnis der letzten Prüfung

**Prüfdatum: 21. August 2026, während der Produktionsvorbereitung**

Alle vorhandenen Testsuiten liefen erfolgreich durch: insgesamt 283 Tests,
davon `ai:test` 87, `workflow:test` 130, `automation:test` 53,
`control:center:test` 7 und `shopify:test` 6. Dafür waren keine
Code-Änderungen nötig.

`npm run ai:providers` wurde lokal nur zur Verfügbarkeitsprüfung ausgeführt,
ohne Login. Das Ergebnis war `CLAUDE_CODE: AVAILABLE` und
`CODEX: AVAILABLE`. Damit sind auf diesem Rechner derzeit alle Router-Rollen
nutzbar.

Bei der Aufräumarbeit im Repository wurden drei leere, nirgends referenzierte
Root-Dateien als unbedenkliche Session-Reste entfernt: `CLAUDE_HAIKU`,
`CODEX_LIGHT` und `PASS`. Alle drei waren 0 Byte groß, in derselben Sekunde
entstanden und wurden im Code nirgends verwendet. Zusätzlich wurden
`.claude/output-styles/`, `qa/fixtures/*`, `SHOPIFY_API_CONNECTION.md`,
`.env.example` und `shopify/` inhaltlich geprüft. Es handelt sich um reguläre,
geheimnisfreie Projektdateien, die im Repository bleiben.

## Was als Nächstes ansteht

1. Einen End-to-End-Test mit dem echten `claude`- oder `codex`-CLI
   durchführen. `detectCapability` und `runAgentProcess` wurden bisher nur mit
   simulierten (injizierten) Ports getestet. Dieser Test soll bestätigen,
   dass alles auch mit den tatsächlich installierten CLIs funktioniert.
2. Die neuen Verzeichnisse `shopify/`, `workflow/providers/` und
   `workflow/tests/` im Haupt-README dokumentieren, damit der Gesamtüberblick
   nicht nur in `docs/AI_CONTROL.md` zu finden ist.
3. Vor dem ersten produktiven Einsatz eine echte, kleine Aufgabe der Klasse A
   oder B einmal komplett durchspielen: erst `npm run ai:route -- "…"`, dann
   `npm run ai:continue`. So wird der gesamte Ablauf einschließlich des
   echten Provider-Aufrufs geprüft.
