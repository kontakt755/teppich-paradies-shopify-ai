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
