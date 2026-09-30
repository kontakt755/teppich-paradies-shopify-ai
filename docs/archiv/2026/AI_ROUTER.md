# AI Router

Der Router hilft bei Reihenfolge und Testtiefe. Er blockiert normale lokale Arbeit nicht und startet keine externe KI. Harte Gates liegen ausschließlich an den Befehlen, die tatsächlich einen geschützten externen Zustand verändern.

## Bedienung

```text
npm run workflow:route -- "Neue Aufgabe: <Beschreibung>"
npm run workflow:status
npm run workflow:next
npm run workflow:continue
```

Auf macOS führt `workflow:continue` eine erforderliche Full-QA automatisch lokal aus. In Cloud-Umgebungen kann derselbe Schritt mit `-- --local-runner` ausdrücklich bestätigt werden.

## Vier getrennte Entscheidungen

Der Router leitet nicht mehr alle Regeln aus einer einzigen Task-Klasse ab:

1. **Aufwand A–D** bestimmt die empfohlene Implementierungsstärke.
2. **Validation Scope** bestimmt `STATIC` oder `FULL`.
3. **Review** ist entweder nicht nötig, empfohlen oder für eine geschützte Aktion erforderlich.
4. **Protected Actions** bestimmen, ob unmittelbar vor der externen Aktion eine frische Human-Freigabe nötig ist.

## Klassen

- **A – mechanisch:** Script zuerst, statische Tests.
- **B – normale Code-Aufgabe:** Standard-Agent und passende statische Tests.
- **C – komplexe lokale Arbeit:** starker Agent; Review empfohlen, aber nicht blockierend.
- **D – Vorbereitung einer geschützten Änderung:** starker Agent beziehungsweise bei Produktvorbereitung zuerst Script; Review vor der geschützten Aktion erforderlich.

Risikowörter allein eskalieren nicht. „Preislogik analysieren“, „Live-Shop prüfen“ oder „irreversible Änderungen verhindern“ sind keine geschützten Aktionen. Erst ein eindeutiger Änderungsauftrag wie „SKU ändern“, „Produkte in Shopify schreiben“ oder „Theme live veröffentlichen“ erzeugt Klasse D und einen Protected Action Marker.

## Modellmatrix (seit 2026-09-08)

Quelle: `workflow/model-matrix.mjs`. Prioritäten: Qualität, Zuverlässigkeit, keine wiederholten Fehler, Architektur, Cross-Provider-Review, Geschwindigkeit, Kosten. Claude Max 20x trägt die Hauptlast; ChatGPT Plus (Codex) nur dort, wo ein unabhängiger Gegencheck Mehrwert hat.

| Klasse | Primary | Reviewer | Zweitblick | Corrector | Final Check | Haiku erlaubt? | Modellaufrufe |
|---|---|---|---|---|---|---|---|
| A trivial | claude `haiku` low | – | – | = Primary | deterministisch | ja | 1 |
| B normal | claude `fable` medium | codex `gpt-5.6-sol` medium | – | = Primary | deterministisch | nur wenn trivial (dann A) | 2–3 |
| C komplex | claude `fable` high | codex `gpt-6-astra` high | codex `gpt-5.6-sol` medium | = Primary | Reviewer, dann deterministisch | nein | 3–5 |
| D kritisch | claude `opus` high | codex `gpt-6-astra` xhigh | codex `gpt-5.6-sol` high, Security-Review claude `fable` high | = Primary | Reviewer, dann deterministisch | nur Hilfsaufgaben | 5–7 |

| Rolle | bevorzugt | Alternative | Fallback |
|---|---|---|---|
| Requirements Challenger | claude opus high | codex gpt-6-astra high | claude fable high |
| Architect | claude opus xhigh | claude fable xhigh | codex gpt-6-astra high |
| Implementer | claude fable high | claude opus high | codex gpt-6-astra high |
| Debugger | claude opus xhigh | claude fable xhigh | codex gpt-6-astra xhigh |
| Reviewer | codex gpt-6-astra high | codex gpt-5.6-sol medium | claude opus high (nie das Autor-Modell) |
| Corrector | = Implementer | claude opus high | codex gpt-6-astra high |
| Security Reviewer | codex gpt-6-astra xhigh | claude fable high | claude opus high |
| Visual Reviewer | claude fable medium | claude sonnet medium | `npm run qa` |
| Deterministic QA | `npm test` / Guards | claude haiku low | – |

**Eskalation** (`escalateStep`): 1. Fehlschlag → Effort eine Stufe höher, 2. → Peer-Modell (fable ↔ opus) high, 3. → codex gpt-6-astra high, danach Human Gate. Derselbe Befund ein zweites Mal (`failureSignature`) überspringt eine Stufe. Haiku scheitert → Aufgabe wird als B behandelt.

**Rate Limit / Kontingent** (`rateLimitFallback`): Claude-Abo → API-Backup (nur mit `ANTHROPIC_FALLBACK_API_KEY`), sonst Codex auf gleichem Niveau. Codex → Claude-Review durch ein anderes Modell als der Autor.

**Rollback:** `TP_ROUTING_STRATEGY=legacy` in `.env.local` stellt das Verhalten vor der Matrix her (kein `--model`, Effort medium, Codex-Konfig-Default). **Belege:** jeder Aufruf steht mit `requestedModel`, `effort`, `taskClass` und `escalation` in `.router/ai-usage.jsonl`; `npm run router:status` zeigt, ob Stop-Hook-Reviews tatsächlich Ergebnisse liefern.

## Reviews und sensible Dateien

Normale Theme-Dateien in `assets/`, `sections/`, `snippets/`, `templates/` und `layout/` gelten nicht pauschal als sensibel. Review wird empfohlen für komplexe Aufgaben und Änderungen an Workflow-/CI-/Import-/Write-Logik, `settings_data.json`, `AGENTS.md` und den Workflow-Regeln.

Eine Empfehlung blockiert weder Implementierung noch statische Validierung noch einen Draft-PR. Ein Review ist verpflichtend, wenn der Auftrag eine geschützte externe Aktion enthält.

## Testtiefe

`STATIC` umfasst Unit-, Automation-, Workflow-, Evidence- und Secret-Checks. `FULL` ergänzt Compare, SEO, Full QA und Sales Readiness gegen Storefront beziehungsweise Preview. Draft-PR und PR-CI bleiben statisch; ein Draft ist nur eine prüfbare Übergabe und keine Deployment-Freigabe.

Full-QA wird nur verlangt, wenn der Auftrag ausdrücklich Storefront-/Browser-/Sales-/Live-Shop-Prüfung fordert oder ein Live-Publish vorbereitet. Ein allgemeiner Theme-Fix oder Architektur-Refactor wird dadurch nicht automatisch zum Local-Runner-Blocker.

## Fehlerfluss

- 429/Cloudflare/WAF: `BLOCKED_EXTERNAL_RATE_LIMIT`, höchstens ein unmittelbarer Script-Retry.
- 503/Timeout/Upstream: `BLOCKED_EXTERNAL_UPSTREAM`, höchstens ein unmittelbarer Script-Retry.
- Cloud-/Proxy-403 zur Storefront: `NEEDS_LOCAL_RUNNER`.
- Assertion, Syntax- oder Testfehler: `CODE_DEFECT`, zurück zum Implementer.
- Unklassifizierter Fehler: `UNKNOWN_BLOCKER`, aber mit `INSPECT_VALIDATION_FAILURE` zurück zum Implementer statt pauschalem Human-Stopp.

## Geschützte Aktionen

Lokale Implementierung, Tests, Commits und Draft-PRs laufen bis zur prüfbaren Übergabe weiter. Frische, commitgebundene Human-Freigabe bleibt erst unmittelbar nötig für:

- Merge nach `main`
- Shopify Live-Publish
- Shopify Writes, insbesondere Preise, SKUs und Varianten
- Massenanlage
- Checkout-, Payment- und Shipping-Änderungen
- DNS und irreversible Änderungen

Freigaben werden nie in State oder Evidence gespeichert. Die vorhandenen PR-, Preview- und Live-Gates bleiben fail-closed. `workflow:continue` merged niemals, veröffentlicht niemals live und führt keinen Shopify Write aus.
