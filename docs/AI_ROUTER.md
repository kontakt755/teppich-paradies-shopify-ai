# AI Router

## Bedienung

```text
npm run workflow:route -- "Neue Aufgabe: <Beschreibung>"
npm run workflow:status
npm run workflow:next
npm run workflow:continue
```

Der Router startet keine externe KI. Er empfiehlt nur den nächsten Ausführer: Script, Codex-/Claude-Rolle, lokaler Mac-Runner oder Mensch.

## Klassen

- **A – mechanisch:** Script zuerst, kein Zweitreview.
- **B – normale Code-Aufgabe:** leichter Agent; Review nur bei sensiblen Dateien.
- **C – komplex:** starker Implementer, Full-QA und unabhängiges Review.
- **D – kritisch:** starker Implementer beziehungsweise bei Produktvorbereitung zuerst Script, unabhängiges Review und Human Gate.

Sensible Bereiche umfassen Workflows, `workflow/`, `qa/`, Theme-Config/Layout/Sections/Snippets/Templates, Checkout-/Payment-/Shipping- und Shopify-Write-Logik sowie `AGENTS.md` und `docs/WORKFLOW.md`.

## Regeln

Deterministische Mechanik und reine Tests verbrauchen keine KI-Credits. Reviewer erhalten möglichst nur Diff, Testreport und Findings. Nach höchstens drei autonomen Reparaturrunden wird zum Menschen eskaliert.

429/Cloudflare/WAF wird `BLOCKED_EXTERNAL_RATE_LIMIT`, 503/Timeout `BLOCKED_EXTERNAL_UPSTREAM`, Cloud-/Claude-Proxy-403 zur Storefront `NEEDS_LOCAL_RUNNER`, Assertion-/Repo-Fehler `CODE_DEFECT`; Unklares bleibt `UNKNOWN_BLOCKER`. Nur 429/503/Timeout erhalten höchstens einen unmittelbaren Script-Retry. Ein späterer Versuch ist manuell und bounded; Agenten werden wegen Netzwerkfehlern nicht neu gestartet.

Cloud-Code eignet sich für Repo-Analyse, Änderungen, statische und Unit-Tests. Storefront Browser-QA, Compare und Sales Readiness laufen auf dem lokalen Mac.

## Produktvorbereitung

Massenaufgaben beginnen mit Supplier-Daten → Normalize → Validate. Nur fachlich unklare Felder gehen an ein starkes Urteilsmodell, danach folgt ein technischer Validator und ein unabhängiges Review. Vor Shopify Write, insbesondere Preisen, SKUs und Varianten, ist eine frische commitgebundene Human-Freigabe zwingend.

Approval wird nie in State oder Evidence gespeichert. `workflow:continue` merged niemals `main`, veröffentlicht niemals live und führt keinen Shopify Write aus.
