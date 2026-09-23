BRANCH:
windows/remote-workflow-setup

ALTER COMMIT:
7b236d2207ea2ac62f8f1ae3fc1e8ccfc716fca0

NEUER COMMIT:
Commit mit Betreff `fix Windows QA process handling` (Hash siehe Git-Historie)

URSACHE WINDOWS QA:
Der Shopify-CLI-Prozess lieferte unter Windows zeitweise leeres oder nicht parsebares stdout beziehungsweise stürzte mit Exit-Code 3221225477 ab. Der bisherige synchrone Wrapper unterschied diese Fälle nicht. Zusätzlich wurde der exakt bekannte Shopify Login-with-Shop X-Frame-Options-Callback wie ein Theme-Fehler behandelt und ein geschlossener Browserkontext konnte Folgefehler erzeugen.

GEÄNDERTE DATEIEN:
- package.json
- qa/run-qa.mjs
- qa/process-runner.mjs
- qa/browser-classification.mjs
- qa/tests/process-runner.test.mjs
- qa/tests/browser-classification.test.mjs
- WINDOWS_FINAL_RECONCILIATION_READY.md

UNIT TESTS:
PASS
ANZAHL:
18

QA EVIDENCE:
PASS

SECRET SCAN:
PASS

FULL QA:
PASS

QA STATUS:
WARN

NEUE REGRESSIONEN:
KEINE

THEME-/BUSINESS-DATEIEN:
UNVERÄNDERT

SELF REVIEW RUNDEN:
3

OFFENE P0:
KEINE

OFFENE P1:
KEINE

OFFENE P2:
- Der direkte Shopify-CLI-Node-Entrypoint bleibt upstream zeitweise instabil; der begrenzte, sichtbare `shopify.cmd`-Fallback lieferte valide Baseline-Daten.
- Bestehende Theme-Check-Baseline und bekannte Browser-/Drittanbieterhinweise bleiben unverändert dokumentiert.

PUSH:
PASS

REMOTE BRANCH:
origin/windows/remote-workflow-setup

READY FOR MAC RECONCILIATION:
JA
