# Router-Architektur

```text
Task -> Domain/Art/Wirkung -> Risiko -> ausgelöste Rollen
     -> Providerwahl -> Implementierung -> Diff-/Risk-Guard
     -> nur erforderliche Quality Gates -> PASS oder klarer Blocker
```

- `FULL`: kleiner LOW-Fast-Path, deterministische QA, kein Modellreview ohne Trigger.
- `GUARDED`: nur die durch Wirkung/Risiko ausgelösten Fachrollen und Gates.
- `HUMAN_GATE`: HIGH wird nicht autonom ausgeführt.
- Provider-Aufrufe haben eine Deadline und ein Abbruchsignal; Timeout parkt nur den betroffenen Task.
- `policyVersion: 1`: vorhandenes Verhalten für alte Manifeste.
- `policyVersion: 2`: rollen- und gatebasiertes Routing.

Core-Dateien: `automation/core/task-router.mjs`, `provider-router.mjs`, `quality-gates.mjs`, `spec-drift.mjs`, `runner.mjs`. `domains/shopify/domain-pack.mjs` verdrahtet Risk-, Diff- und Spec-Guard, ohne Shopify-Regeln in den Core zu ziehen.
