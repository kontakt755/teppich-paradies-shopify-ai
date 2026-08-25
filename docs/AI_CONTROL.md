# AI Control – Orchestrator

Ergänzt `docs/AI_ROUTER.md`. Der Router **empfiehlt** den nächsten Ausführer;
AI Control **startet** ihn tatsächlich und läuft bis zum nächsten Gate weiter.

Keine Laufzeit-Abhängigkeit zu ChatGPT Work. Primäre lokale Provider sind
Claude Code und Codex.

## Bedienung

```text
npm run ai:providers                       # welche Provider sind lokal nutzbar?
npm run ai:route -- "Produktseite verbessern"
npm run ai:continue                        # läuft selbstständig bis zum Gate
npm run ai:status                          # wo stehen wir
npm run ai:next                            # nächster zulässiger Schritt
npm run ai:stop                            # kontrolliert anhalten
npm run ai:resume                          # nach Abbruch: sicher fortsetzbar?
npm run ai:usage                           # heutige lokale Verbrauchsmetriken
npm run ai:usage:range -- --days 7         # Verbrauch über einen Zeitraum, inkl. Rework-Gründen
npm run ai:unlock                          # verwaisten Run Lock prüfen/entfernen
npm run ai:check-workspace                 # ist ein schreibender Lauf sicher?
npm run ai:batch -- pfad/zu/aufgaben.txt   # mehrere Aufgaben nacheinander abarbeiten
```

## Mehrere Aufgaben nacheinander (`ai:batch`)

`workflow/batch-run.mjs` ruft für jede Aufgabe in einer Textdatei nacheinander
exakt `ai:route` und `ai:continue` auf - kein neuer Ausführungsmechanismus,
nur automatisiertes Hintereinander-Tippen. Diff-Scoping, Nemotron-Erstpass,
Codex-Eskalation, Human Gates: alles wie sonst auch.

Format der Datei: Aufgaben getrennt durch eine Zeile mit genau `---`. Ein
Block kann optional mit `FILES: a,b,c` beginnen (`--files`-Override nur für
diese eine Aufgabe):

```text
FILES: snippets/tp-fix.liquid
Kleinen Anzeigefehler in der Produktkarte beheben...
---
Kleinen CSS-Fix im Grid umsetzen...
```

Hält **automatisch an**, sobald eine Aufgabe nicht mit `DONE` endet (Human
Gate, Rate Limit, Fehler) - der Rest der Liste bleibt unangetastet für den
nächsten Lauf. Kein stilles Überspringen.

## Wöchentlicher Verbrauchs-Check (lokal, kein Cloud-Cron)

`automation/scripts/weekly-usage-check.mjs` schreibt einmal pro Woche einen
Report nach `.workflow/reports/usage-weekly-*.txt` und stößt eine
macOS-Systembenachrichtigung an. Läuft über einen lokalen `launchd`-Job
(`~/Library/LaunchAgents/com.teppichparadies.ai-router.weekly-usage-check.plist`,
jeden Montag 08:00) - **nicht** über eine Cloud-Routine, weil die
Verbrauchsdaten unter `.workflow/usage/` ausschließlich lokal liegen und
nicht Teil des Git-Repos sind.

```text
launchctl list com.teppichparadies.ai-router.weekly-usage-check   # Status
launchctl start com.teppichparadies.ai-router.weekly-usage-check  # sofort auslösen
launchctl unload ~/Library/LaunchAgents/com.teppichparadies.ai-router.weekly-usage-check.plist  # deaktivieren
```

Für einen ausdrücklich freigegebenen Sonderfall lässt sich die Implementer-Rolle
überschreiben: `npm run ai:route -- "…" --implementer CLAUDE_SONNET --reason "…"`.
Das ist eine bewusste Operator-Entscheidung, wird in `task.json` festgehalten
und im Log ausgegeben. Ein erschöpftes Kontingent oder ein Rate Limit führt
**niemals** von selbst zu einem Providerwechsel.

Symmetrisch dazu lässt sich die Reviewer-Rolle überschreiben:
`npm run ai:route -- "…" --reviewer CODEX_LIGHT --reason "…"`. Bei Klasse B
läuft standardmäßig bereits ein Nemotron-Erstpass vor Codex (siehe
`docs/AI_ROUTER.md#nemotron-klasse-b-erstpass-vor-codex`) – ein
`--reviewer`-Override schaltet diesen Erstpass komplett ab und erzwingt exakt
den gewählten Reviewer, ohne Zwischenstufe. Das ist für den Sonderfall
gedacht, bei dem eine bewusste Entscheidung nötig ist (z. B. nur Nemotron,
keine Eskalation: `--reviewer NEMOTRON_REVIEW`), nicht für den Alltag.

Optionen für `ai:continue`: `--local-runner`, `--retry-now`, `--allow-dirty`,
`--clear-stop`, `--max-iterations=N`.
Optionen für `ai:route`: `--files a,b`, `--risk LOW`.

Alle Kommandos geben zusätzlich zu den maschinenlesbaren Zeilen eine
Klartext-Erklärung aus (`-> …`). Für Scripting und CI unterdrückt `--raw`
diese Zeilen; die maschinenlesbare Ausgabe bleibt dabei unverändert.

Im Normalfall reichen zwei Befehle:

```text
npm run ai:route -- "Aufgabe ..."
npm run ai:continue
```

`ai:continue` läuft dann selbstständig weiter bis `DONE`, `HUMAN_GATE`,
`NEEDS_AHMET`, `SECURITY_STOP`, `REVIEW_LIMIT_REACHED` oder einem echten
externen Blocker – ohne Zwischenfragen.

## Ablauf

```text
ai:route  -> Klassifizierung (A–D), Task-Policy, .workflow/task.json
ai:continue
   ROUTE -> IMPLEMENT -> VALIDATE -> REVIEW
                            ^          |
                            |          v (P1/P2)
                            +------ CORRECT      (max. 3 Review-Runden)
   -> HUMAN GATE / NEEDS_AHMET / DONE
```

Jede Iteration leitet den Zustand neu aus Git + `.workflow/` ab. Es gibt keinen
verborgenen Fortschritt und keine parallelen Writer.

## Provider

| Router-Rolle | Provider | Modus |
|---|---|---|
| `SCRIPT` | – (deterministisch) | kein Modell |
| `CODEX_LIGHT` / `CODEX_MEDIUM` | Codex CLI (`codex exec`) | `--sandbox read-only` bzw. `workspace-write` |
| `CLAUDE_STRONG` / `CLAUDE_HAIKU` / `CLAUDE_SONNET` | Claude Code (`claude --print`) | Planmodus bzw. eng begrenzte Edit-Tools |
| `NEMOTRON_REVIEW` | NVIDIA Nemotron (NIM-API, Cloud, kein CLI) | nur READ_ONLY, Klasse-B-Erstpass vor Codex |

Kostensparender Standard: Klasse A bleibt vollständig skriptbasiert. Klasse B
nutzt Claude Haiku, Klasse C Claude Sonnet und die seltene kritische Klasse D
weiterhin die starke Claude-Rolle. Codex läuft standardmäßig als unabhängiger
Reviewer für reviewpflichtige C- und D-Änderungen; dadurch prüft Claude nicht
die eigene Arbeit. Bei Klasse B prüft zuerst Nemotron (`NEMOTRON_REVIEW`) den
Diff kostengünstig vor – ein sauberes PASS auf reinem Theme-Markup ersetzt
Codex vollständig, jeder Fund, jeder Ausfall und Dateien mit Geld-/CI-/
Orchestrator-Bezug eskalieren unverändert an Codex. Details und die genaue
Eskalationsliste stehen in `docs/AI_ROUTER.md#nemotron-klasse-b-erstpass-vor-codex`.

Capability Detection prüft zuerst `--help` (existiert das CLI, kennt es den
Non-Interactive-Modus?) und danach den lokalen Loginstatus mit
`claude auth status` beziehungsweise `codex login status`. Diese Prüfungen
starten kein Modell und verbrauchen keine Modell-Credits.

`ai:continue` prüft nicht mehr vorsorglich beide Provider. Ein Provider wird
erst unmittelbar vor der Phase geprüft, die ihn wirklich braucht; innerhalb
desselben Laufs wird das Ergebnis wiederverwendet. Eine reine CLASS-A-Aufgabe
führt deshalb überhaupt keine Providerprüfung aus.

Es wird **nichts installiert** und **kein Ersatzprovider** gewählt. Der Lauf
stoppt sauber.

Status: `AVAILABLE`, `UNAVAILABLE`, `AUTH_REQUIRED`, `RATE_LIMITED`, `FAILED`.

## Verbrauchsmetriken

Jeder `ai:continue`-Lauf schreibt genau einen lokalen JSONL-Eintrag nach
`.workflow/usage/router-YYYY-MM-DD.jsonl`. Der Aufgabentext, Agentenprompts und
Provider-Ausgaben werden nicht gespeichert. Stattdessen enthält der Eintrag
nur Task-ID und -Hash, Klasse, Provider-/Modellrollen, Modellaufrufe, Dauer und
Stopgrund.

```text
npm run ai:usage
npm run ai:usage -- --day 2026-08-22
```

Tokenwerte werden nur ausgewiesen, wenn alle beteiligten CLIs sie als
strukturierte Metadaten geliefert haben. Fehlende Werte bleiben `null`; der
Router schätzt sie nicht. Für Abonnementkontingente sind Modellaufrufe und der
Anteil reiner Script-Läufe meist die belastbareren lokalen Vergleichswerte.

Zwei Details des Claude-Code-Aufrufs, die leicht zu übersehen sind:

- **Der Prompt geht über stdin, nicht als Argument.** `--allowed-tools` ist
  variadisch und würde ein nachfolgendes Prompt-Argument verschlucken; das CLI
  meldet dann „Input must be provided either through stdin or as a prompt
  argument" und der Agent läuft nie. Außerdem sind die Prompts mehrere KB groß.
- **Schreibende Läufe brauchen `--permission-mode acceptEdits`.** Im
  Print-Modus gibt es keine Rückfrage; ohne den Modus passiert schlicht nichts.
  `bypassPermissions` wird bewusst nicht verwendet – die Tool-Allowlist bleibt
  eng (kein Bash), und Diff-Scoping plus RiskGuard prüfen jede Änderung danach.

## Agentenresultat

Jeder Agent muss sein Ergebnis als JSON zwischen `<<<AGENT_RESULT>>>` und
`<<<END_AGENT_RESULT>>>` ausgeben. Ohne auswertbaren Resultatblock gilt der Lauf
als `FAILED` – ein geschwätziger Agent wird nie als PASS gewertet.

Felder: `provider`, `role`, `status`, `summary`, `changedFiles`, `tests`,
`findings`, `blockers`, `git`, dazu optional `actualOperations`, `resources`,
Zeitstempel, `exitCode`, `durationMs`, `retryable`, `workspace`. Secrets werden
vor dem Schreiben redigiert.

## Sicherheitsregeln

Unverändert gültig und durch AI Control nicht abgeschwächt:

- Human Gates: Merge nach `main`, Git Push, PR-Erstellung/-Merge, Shopify
  Writes, Produktanlage, Preis-/SKU-/Variantenänderung, Checkout, Payment,
  Shipping, DNS, Preview Push, Live Publish, irreversible Aktionen.
- Human Approval wird **nie** gespeichert; sie muss zum aktuellen Commit und
  konkreten Gate passen (`assertProtectedAction`).
- Maximal 3 Review-/Korrekturrunden, danach `REVIEW_LIMIT_REACHED`.
- P0 = Hard Fail, P1/P2 = Korrektur, HIGH Risk = `NEEDS_AHMET`.
- Unbekannte Operationen und Dateien außerhalb der Allowlist = Hard Stop.
- Run Lock verhindert zwei Writer auf demselben Working Tree.
- Stale Evidence wird nie weiterverwendet.
- 429/503/Timeout lösen **keinen** Providerwechsel aus.
- Harte Iterationsobergrenze; keine Endlosschleifen.

Die autonome Arbeit läuft nie mit Risk `HIGH`. `allowedOperations` enthält
niemals `git_push`, `theme_publish`, `product_change`, `price_change`,
`merge_main` o. ä. Die Default-Allowlist schließt `templates/product*.json` und
`config/settings_data.json` bewusst aus.

## Phasen eines Laufs

`ai:continue` arbeitet iterativ, nicht in einem Rutsch. Jede Iteration leitet
den Zustand neu ab und entscheidet, was als Nächstes dran ist:

| `nextAllowedAction` | Phase | Was passiert |
|---|---|---|
| `HANDOFF_IMPLEMENTER` | `IMPLEMENT` | Implementer läuft, Diff wird gescoped und persistiert |
| `RUN_STATIC_VALIDATION` | – | Validierung, kein Agent |
| `HANDOFF_REVIEWER` | `REVIEW` | **kein zweiter Implementer**; Reviewer läuft auf dem gespeicherten Ergebnis, bei Findings folgt die Korrektur |
| `PREPARE_DRAFT_PR` | – | fertig, `DONE` |

Zwei Dinge sind dafür nötig und leicht zu übersehen:

1. **Der Task-State wird vor jeder Iteration zurückgesetzt.** Der
   `ManifestRunner` behandelt `PASS` und `SECURITY_STOP` als endgültig und
   überspringt solche Tasks. Ohne Reset würde ab dem zweiten Handoff kein Agent
   mehr starten – der Loop liefe bis `NO_PROGRESS`.
2. **Die Review-Pflicht kommt aus dem abgeleiteten State, nicht aus der Route.**
   Eine Klasse-B-Aufgabe kann erst durch den tatsächlichen Diff reviewpflichtig
   werden (sensible Datei berührt). Stünde nur `route.reviewRequired` zur
   Verfügung, wäre der Reviewer gar nicht verdrahtet.

Das gemessene Implementer-Ergebnis liegt in `.workflow/ai-scope.json` und
überlebt damit den Wechsel zwischen zwei `ai:continue`-Aufrufen. Der Reviewer
bekommt daraus exakt die Dateiliste des Agentenlaufs.

Startet ein Reviewer-Handoff keinen Reviewer, hält der Lauf mit einem Blocker
an, statt weiterzudrehen. Der `NO_PROGRESS`-Schutz bleibt davon unberührt.

### Kein Reviewer ohne Implementer-Ergebnis

`deriveHandoffState` leitet aus `changedFiles` ab, ob schon implementiert
wurde. In einem schmutzigen Working Tree ist das **immer** wahr – auch ohne
jeden Agentenlauf. Der Router würde `HANDOFF_IMPLEMENTER` überspringen und
direkt einen Reviewer anfordern, der nichts zu prüfen hat.

Deshalb gilt vor jedem Reviewer-Handoff eine harte Invariante: es muss ein
Implementer-Ergebnis geben, das an **Aufgabe und Commit** gebunden ist
(`.workflow/ai-scope.json`).

| Befund | Folge |
|---|---|
| kein Ergebnis / leere Dateiliste | Phase wird auf `IMPLEMENT` gezwungen – erst implementieren |
| Ergebnis einer anderen Aufgabe | `NEEDS_AHMET` |
| Ergebnis zu einem anderen Commit | `NEEDS_AHMET` |
| Agenten-Diff hat sich seither geändert | `NEEDS_AHMET` |
| gültig | Reviewer läuft mit genau dieser Dateiliste |

`ai:route` verwirft alle taskbezogenen Artefakte des vorherigen Laufs:
Runner-State, Candidate (`ai-scope.json`), Baseline und Review-Evidence. Der
Working Tree wird dabei nie angefasst.

## Diff-Scoping

Mit `--allow-dirty` läuft ein Agent auf einem Working Tree, der bereits fremde,
nicht committete Änderungen enthält. Damit diese nicht dem Agenten zugerechnet
werden, wird jeder **schreibende** Agentenlauf eingeklammert:

1. Vor dem Start: Baseline-Snapshot (HEAD, Hash und Inhaltskopie jeder bereits
   geänderten Datei) unter `.workflow/ai/baseline/<taskId>/`.
2. Nach dem Ende: erneute Aufnahme, Differenz beider Stände.
3. Nur diese Differenz ist der Agenten-Diff.

Der Working Tree wird dabei nie verändert – kein `stash`, `reset`, `checkout`
oder `commit`, nur Lesen und Kopieren.

Was der Reviewer sieht, was der RiskGuard prüft und was in `changedFiles`
landet, ist ausschließlich dieser Agenten-Diff. Die Selbstauskunft des Agenten
wird nicht geglaubt, sondern gegen die Messung geprüft.

**Fail-safe-Regeln** – nichts wird still übernommen:

| Befund | Ergebnis |
|---|---|
| Datei außerhalb der Allowlist geändert | `SECURITY_STOP` |
| HEAD hat sich während des Laufs bewegt | `NEEDS_AHMET` |
| Datei geändert, aber vom Agenten nicht gemeldet | `NEEDS_AHMET` |
| Baseline fehlt oder ist unlesbar | `NEEDS_AHMET` |
| Vorher geänderte Datei blieb unberührt | wird dem Agenten **nicht** zugerechnet |
| Vom Agenten gemeldet, real unverändert | nur Hinweis, kein Stop |

Der härteste Befund gewinnt. `.workflow/`, `.git/`, `node_modules/` und die
getrackte Evidence-Datei bleiben außen vor – dort schreibt der Orchestrator
selbst.

Die Review-Evidence speichert zusätzlich `agentDiffFingerprint` und
`reviewedFiles`. Ändert sich der agentenspezifische Diff nachträglich, ist das
Review ungültig – auch dann, wenn der übrige Working Tree gleich geblieben wäre.

## Isolation (Phase 10)

Ein **schreibender** Agentenlauf ist bei schmutzigem Working Tree gesperrt
(`DIRTY_WORKTREE`). Es wird nichts automatisch gestasht, committet, verschoben
oder verworfen. Optionen:

1. eigene Änderungen selbst sichern (Commit oder eigener Branch), oder
2. bewusst `npm run ai:continue -- --allow-dirty`.

## Stop-Gründe

`DONE`, `HUMAN_GATE`, `NEEDS_AHMET`, `SECURITY_STOP`, `HARD_FAIL`,
`REVIEW_LIMIT_REACHED`, `CORRECTION_REQUIRED`, `PROVIDER_UNAVAILABLE`,
`PROVIDER_AUTH_REQUIRED`, `RATE_LIMITED`, `BLOCKED_EXTERNAL`,
`NEEDS_LOCAL_RUNNER`, `NEEDS_DETERMINISTIC_SCRIPT`, `DIRTY_WORKTREE`,
`STALE_STATE`, `RUN_LOCKED`, `MANUAL_STOP`, `MAX_ITERATIONS`, `NO_TASK`,
`NO_PROGRESS`, `UNKNOWN_BLOCKER`.

`DONE` bedeutet: Arbeit umgesetzt, validiert, ggf. reviewt. Der Orchestrator
erstellt **keinen** PR und merged nicht – das bleibt eine bewusste Aktion.
`NEEDS_DETERMINISTIC_SCRIPT` erscheint, wenn der nächste Ausführer laut Router
`SCRIPT` ist: dann läuft kein Agent, sondern ein deterministisches Kommando.

Jeder Stop nennt den Grund und die nächsten möglichen Befehle
(freigeben / ändern / prüfen / stoppen).

## Tests

```text
npm run ai:test        # Orchestrator + Provider (Fake-Provider, kein Netz)
npm run workflow:test  # Router inklusive Shopify-Write-Erkennung
```

Die E2E-Tests decken ab: Low Risk ohne Review, Medium Risk mit Review,
Review-Finding mit genau einer Korrektur, Human Gate, Provider unavailable,
429 ohne Providerwechsel, Review-Limit, stale Evidence und die deutsche
Shopify-Write-Erkennung.
