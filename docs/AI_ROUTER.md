# AI Router

## Bedienung

```text
npm run workflow:route -- "Neue Aufgabe: <Beschreibung>"
npm run workflow:status
npm run workflow:next
npm run workflow:continue
```

Der Router startet keine externe KI. Er empfiehlt nur den nächsten Ausführer: Script, Codex-/Claude-Rolle, lokaler Mac-Runner oder Mensch.

Wer die Provider tatsächlich starten und bis zum nächsten Gate durchlaufen lassen will, nutzt den Orchestrator: `npm run ai:route -- "…"` gefolgt von `npm run ai:continue`. Siehe `docs/AI_CONTROL.md`.

## Klassen

- **A – mechanisch:** Script zuerst, kein Zweitreview.
- **B – normale Code-Aufgabe:** leichter Agent; Review nur bei sensiblen Dateien.
- **C – komplex:** starker Implementer, Full-QA und unabhängiges Review.
- **D – kritisch:** starker Implementer beziehungsweise bei Produktvorbereitung zuerst Script, unabhängiges Review und Human Gate.

Sensible Bereiche umfassen Workflows, `workflow/`, `qa/`, Theme-Config/Layout/Sections/Snippets/Templates, Checkout-/Payment-/Shipping- und Shopify-Write-Logik sowie `AGENTS.md` und `docs/WORKFLOW.md`.

Eine mechanisch formulierte Aufgabe wird automatisch mindestens Klasse B,
wenn die angegebene Dateiliste einen sensiblen Bereich enthält. Der Wert von
`--files` wird als Router-Metadatum verarbeitet und niemals Teil des freien
Aufgabentexts.

## Regeln

Deterministische Mechanik und reine Tests verbrauchen keine KI-Credits. Reviewer erhalten möglichst nur Diff, Testreport und Findings. Nach höchstens drei autonomen Reparaturrunden wird zum Menschen eskaliert.

429/Cloudflare/WAF wird `BLOCKED_EXTERNAL_RATE_LIMIT`, 503/Timeout `BLOCKED_EXTERNAL_UPSTREAM`, Cloud-/Claude-Proxy-403 zur Storefront `NEEDS_LOCAL_RUNNER`, Assertion-/Repo-Fehler `CODE_DEFECT`; Unklares bleibt `UNKNOWN_BLOCKER`. Nur 429/503/Timeout erhalten höchstens einen unmittelbaren Script-Retry. Ein späterer Versuch ist manuell und bounded; Agenten werden wegen Netzwerkfehlern nicht neu gestartet.

Cloud-Code eignet sich für Repo-Analyse, Änderungen, statische und Unit-Tests. Storefront Browser-QA, Compare und Sales Readiness laufen auf dem lokalen Mac.

## Nemotron (Klasse-B-Erstpass vor Codex)

`NEMOTRON_REVIEW` ist eine zusaetzliche Reviewer-Rolle (NVIDIA Nemotron 3
Super, ueber die NIM-API). Anders als Claude Code und Codex ist Nemotron kein
lokaler Agent mit eigenen Datei-Werkzeugen, sondern ein reiner
Cloud-Chat-Endpoint ohne Repo-Zugriff - er bekommt ausschliesslich den Diff
und Testreport im Prompt, wie jeder andere Reviewer auch, und laeuft nie im
WRITE-Modus.

**Standardbestandteil der Klasse-B-Route.** Jede reviewpflichtige
Klasse-B-Aufgabe (`route.preReviewer = NEMOTRON_REVIEW`) bekommt Nemotron
zuerst zu sehen - siehe `review()` in `workflow/ai-control-core.mjs`:

- **Nemotron PASS auf reinem Theme-Markup** (`sections/`, `snippets/`,
  `templates/`, `layout/`, `config/` - alles ausser der Hard-Escalation-Liste
  unten) **ersetzt Codex vollstaendig.** Kein zweiter Modellaufruf, keine
  Codex-Credits verbraucht.
- **Jeder Fund (`FINDINGS`), jeder Ausfall** (kein `NVIDIA_API_KEY`,
  Rate-Limit, Timeout, Netzwerkfehler) **und jede Datei aus der
  Hard-Escalation-Liste eskalieren unveraendert an `CODEX_LIGHT`** - der alte
  Weg laeuft dann exakt wie vorher. Ein nicht konfigurierter Nemotron ist also
  nie ein Blocker, nur eine ausbleibende Ersparnis.
- **Hard-Escalation-Liste** (`requiresHardEscalation()` in `workflow/router.mjs`):
  `.github/workflows/`, `workflow/`, `qa/`, Checkout/Payment/Shipping-Pfade,
  Produkt-Import/Write/Sync/Bulk-Pfade, Shopify-Write-Pfade, `AGENTS.md`,
  `docs/WORKFLOW.md`. Bei diesen Dateien reicht ein Nemotron-PASS nie - Geld,
  CI und der Orchestrator/QA-Harness selbst bekommen immer Codex.
- Ein **`SECURITY_STOP`** von Nemotron eskaliert nicht an Codex, sondern
  stoppt sofort - wie ein `SECURITY_STOP` von jedem anderen Reviewer auch.

**Ausdrueckliches Override deaktiviert den Erstpass komplett** (kein
Zwischenschritt, exakt der gewaehlte Reviewer laeuft einmal):

```text
npm run ai:route -- "CSS-Fix im Produktkarten-Grid" --reviewer CODEX_LIGHT --reason "Erstpass diesmal ueberspringen"
npm run ai:route -- "CSS-Fix im Produktkarten-Grid" --reviewer NEMOTRON_REVIEW --reason "nur Nemotron, keine Eskalation"
```

Grund fuer die Hard-Escalation-Grenze: Nemotron laeuft ueber einen dritten
Cloud-Anbieter (`build.nvidia.com`) mit Free-Tier-Realitaet - kein SLA,
~40 Requests/Minute, API-Key nur 6 Monate gueltig. Das ist eine neue
Vertrauens- und Datenabfluss-Grenze gegenueber den lokalen CLI-Providern
(eigene Abos, kein Netzwerk-Tool). Deshalb zusaetzlich:

- Klasse D nutzt `NEMOTRON_REVIEW` nie (kein `preReviewer` im D-Profil) -
  kritische/Shopify-Write-nahe Aufgaben bleiben ausschliesslich bei Codex.
- `NVIDIA_API_KEY` steht nur in `.env` (siehe `.env.example`), niemals im
  Task-Text oder in `--files`.
- Ein 429/Rate-Limit fuehrt wie bei jedem Provider **nicht** automatisch zu
  einem Wechsel - es eskaliert (wie jeder Ausfall) einfach an Codex.
- Ohne gesetzten `NVIDIA_API_KEY` meldet `npm run ai:providers` fuer
  `NEMOTRON` den Status `AUTH_REQUIRED` - reine, kreditfreie Pruefung, es wird
  dafuer kein Modellaufruf gestartet; `ai:continue` eskaliert in diesem Fall
  bei jeder Klasse-B-Review sofort und transparent an Codex.

Adapter: `workflow/providers/nemotron.mjs`. Eskalationslogik und Tests:
`workflow/ai-control-core.mjs` (`review()`), `workflow/tests/reviewer-handoff.test.mjs` (Tests 8a-8f).

## Produktvorbereitung

Massenaufgaben beginnen mit Supplier-Daten → Normalize → Validate. Nur fachlich unklare Felder gehen an ein starkes Urteilsmodell, danach folgt ein technischer Validator und ein unabhängiges Review. Vor Shopify Write, insbesondere Preisen, SKUs und Varianten, ist eine frische commitgebundene Human-Freigabe zwingend.

Approval wird nie in State oder Evidence gespeichert. `workflow:continue` merged niemals `main`, veröffentlicht niemals live und führt keinen Shopify Write aus.
