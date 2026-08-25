# AI-Router: KI-Kostenoptimierung — Recherchebericht
**Datum:** 25. August 2026  
**Berichtszeitraum:** 24.–25. August 2026

## Quellenreferenzen
Hinweis: Der erste Implementer-Durchlauf dieses Berichts hat plausibel klingende,
aber teils falsche/erfundene URLs eingesetzt (z. B. eine nicht existierende
NVIDIA-Blog-Adresse) - weder Nemotron- noch Codex-Review haben das erkannt, da
keiner der beiden Reviewer Internetzugriff hat. Die folgende Liste wurde
deshalb manuell durch echte, direkt gepruefte Quellen ersetzt. Siehe
"Router-Verbesserungsideen" unten.
- NVIDIA Blog, Nemotron 3.5 Lightning + NeMo Switchyard: https://blogs.nvidia.com/blog/nemotron-lightning-switchyard-rtx-dgx/
- NVIDIA Technical Blog, NeMo Switchyard im Detail: https://developer.nvidia.com/blog/route-ai-agent-workloads-across-models-with-nvidia-nemo-switchyard/
- NVIDIA NeMo Switchyard Repository (Open Source): https://github.com/NVIDIA-NeMo/Switchyard
- NVIDIA NIM Modellkarte Nemotron 3.5 Lightning: https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b/modelcard
- Claude Code Pricing 2026 (Sonnet-5-Einführungspreise dauerhaft): https://www.cloudzero.com/blog/claude-code-pricing/
- Codex vs. Claude Code, Pricing-Überblick August 2026: https://www.morphllm.com/comparisons/codex-vs-claude-code
- LLM-API-Preisvergleich (GLM/DeepSeek/Qwen/Kimi), August 2026: https://www.morphllm.com/llm-api
- Beste Open-Source-Coding-Modelle 2026 (Kimi K3, GLM, DeepSeek, Qwen): https://www.morphllm.com/best-open-source-coding-model-2026

Für die Anthropic- und OpenAI-Preispunkte lag keine direkt zitierfähige
Primärquelle (offizieller Blogpost) in der Recherche vor - die Angaben stammen
aus den oben verlinkten Drittanbieter-Preisübersichten, nicht aus einer
Anthropic- oder OpenAI-eigenen Ankündigung. Vor einer echten Entscheidung
darauf noch einmal gegen die offizielle Quelle prüfen.

## Zusammenfassung nach Handlungsbereich

| Modell / Initiative | Empfehlung | Aktion | Status |
|---|---|---|---|
| **NVIDIA Nemotron 3.5 Lightning** (`nvidia/nemotron-3.5-lightning-30b-a3b`, 30B/3B aktiv, 11.8.2026) | Beobachten + Produktionstest planen | Weiterhin Super (`nvidia/nemotron-3-super-120b-a12b`, 120B/12B) als Standard; Herstellerangabe: bis zu 4× schneller; Free-Tier-Testlauf war uneindeutig; `NEMOTRON_MODEL` in .env verfügbar für Umschaltung ohne Code-Änderung | In Evaluierung |
| **NVIDIA NeMo Switchyard** | Referenzarchitektur für zukünftige Überarbeitung | Keine akute Integration; Escalation-Router-Muster analog zu unserem Nemotron→Codex-Muster in `workflow/ai-control-core.mjs`; Herstellerangabe: 74 % Kostenersparnis bei 93 % erhaltener Genauigkeit (mit Lightning + Claude Opus 4.8) | Documented |
| **Anthropic Sonnet 5 Preisanpassung** (Erhöhung rückgängig, 1.9.2026) | Keine Änderung erforderlich | Einfuhrungspreise (2 $/10 $ pro Million Token) bleiben dauerhaft; keine Updates für `CLAUDE_SONNET`/`CLAUDE_HAIKU`-Rollen nötig | Abgeschlossen |
| **OpenAI Codex-Tier** (kostenlos + 8 $/Monat Go-Tier, 13.8.2026) | Notiz für Marktbeobachtung | Bestehende Codex-Integration über Standard-Abo ausreichend; keine Änderungen erforderlich | Monitored |
| **Alternative Modelle** (GLM-4.7-Flash kostenlos, Qwen3.7-Flash 0,03 $/0,13 $ pro Million Token Input/Output, Kimi K3 stark bei Agentic-Coding-Benchmarks) | Kandidaten für neue Router-Rollen | Modelle mit Coding-Fähigkeiten dokumentiert; aktuell nicht integriert, für `workflow/providers/` langfristig interessant | Backlog |
| **Router-Verbesserungsideen** (beim Live-Test dieses Berichts über den Router gefunden) | Siehe Detail je Punkt | (1) Wörter wie „docs“, „Format“ oder „Dokumentation“ im Task-Text stufen faelschlich als Klasse A (SCRIPT, kein Agent) ein → stiller No-Op ohne Fehlermeldung — **offen**, betrifft `classifyTask()` in `workflow/router.mjs`. (2) `classifyFailure()` konnte echte lokale Testfehler faelschlich als externes Rate Limit einstufen, wenn Testnamen zufaellig „429“/„rate limit“ enthalten — **behoben** (25.8., zweiter Test-Lauf): neuer `networkCapable`-Parameter in `classifyFailure()`/`runWithExternalRetry()` (`workflow/router.mjs`), von `runValidation()` (`workflow/core.mjs`) fuer alle nicht-Browser-Schritte (UNIT/AUTOMATION/WORKFLOW_TESTS/QA_EVIDENCE/SECRET_SCAN) auf `false` gesetzt - diese Schritte fuehren nie einen echten Netzwerkaufruf aus und koennen daher nie legitim an einem externen Rate Limit scheitern. (3) `ai:route --files` wurde bei `ai:continue` nicht wiederverwendet und die Einschraenkung dadurch zur Laufzeit ignoriert (breiter Standard-Allowlist-Fallback) — **behoben** in `workflow/ai-control.mjs` (`route.filesOverride`). (4) Der Implementer hat bei diesem Bericht plausible, aber erfundene Quell-URLs erzeugt; kein Reviewer hat es bemerkt, da beide ohne Internetzugriff arbeiten — grundsaetzliche Grenze der aktuellen Reviewer-Rollen bei faktenbasierten Aufgaben, kein reiner Router-Bug. (5) **Schwerwiegend, behoben (25.8.):** Ein Reviewer, der nicht fertig laeuft (BLOCKED/RATE_LIMITED/UNAVAILABLE/TIMEOUT/AUTH_REQUIRED), wurde in `review.json` faelschlich als `status: PASS, p0: 0, p1: 0` dokumentiert - `createReviewEvidence()` zaehlte P0/P1 nur aus den rohen (bei einem Ausfall leeren) Provider-Findings, nicht aus dem tatsaechlich berechneten Verdict. Live beobachtet: ein echter Codex-Netzwerkfehler fuehrte zu genau dieser falschen PASS-Evidence. Fix in `workflow/ai-control-core.mjs` (`finalizeReviewResult()` schreibt jetzt das berechnete Verdict inkl. synthetischem P1-Finding in `lastResults.reviewer.findings`). (6) Tief verschachtelte `spawnSync`-Prozessketten (`ai:continue` → `npm run workflow:validate` → `node cli.mjs` → `node --test`) zeigten mehrfach einen echten, aber ausserhalb dieser Kette nicht reproduzierbaren Exit-Code-1-Fehlschlag bei WORKFLOW_TESTS (dieselben Tests liefen direkt aufgerufen dreimal in Folge fehlerfrei) — **offen, Ursache ungeklaert**, vermutlich Ressourcen-Kontention bei paralleler Node-Prozesslast; mit Fix (2) wird das jetzt wenigstens korrekt als CODE_DEFECT statt als erfundenes Rate Limit gemeldet. | 2 offen, 3 behoben, 1 strukturelle Grenze |

## Handlungskonsequenzen

**Kurzfristig (nächste 2 Wochen):**  
Keine Änderungen erforderlich; aktueller Router-Stand in `workflow/router.mjs` und Providers-Stack sind stabil.

**Mittelfristig (nächste Monate):**  
- Nemotron 3.5 Lightning A/B-Test unter realen Workloads prüfen
- NeMo Switchyard Referenzimplementierung als Benchmark für Escalation-Muster studieren

**Langfristig (nächster größerer Router-Refactor):**  
- Escalation-Router-Architektur überprüfen und ggf. von Switchyard adaptieren
- Alternative Modelle aus `workflow/providers/` kalibrieren und in neue Rollen integrieren
- Task-Einstufungs- und Fehlerklassifizierungs-Quirks aufgreifen
