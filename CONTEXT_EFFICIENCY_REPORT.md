# Context Efficiency Report

Messstand: 2026-08-12 vor SHP-009-Ausführung.

| Artefakt | Gemessen | Empfehlung |
|---|---:|---|
| `AGENTS.md` | 197 Zeilen / 7.314 Bytes | Als verbindliche Regeln referenzieren; pro Task nur einschlägige Abschnitte zusätzlich in den Context Pack aufnehmen. |
| Typischer Task Context Pack | Noch nicht materialisiert | Ziel: 2–8 KB; Taskzeile, Allowlist, Budgets, relevante Abhängigkeitsergebnisse und höchstens 30 QA-Zeilen. |
| QA Evidence | Kompaktfilter-Ziel ≤30 relevante Zeilen; Rohartefakte git-ignoriert | Nur erste relevante Assertion, Befehl, Exitcode und kleine Pfadreferenz übergeben. |
| State-Datei | Typisch ca. 0,15–1 KB pro Task | Nur aktuellen Task plus direkte Abhängigkeiten laden, nicht den gesamten Run-Verlauf. |
| Report | Vorhanden 0,8–2,0 KB je SHP-Report; sechs Reports zusammen 7.057 Bytes | Nur aktuellen Report oder eine kurze Statusmatrix in Worker-Kontext geben. |
| Master Roadmap | 97 Zeilen / 10.198 Bytes | Nicht vollständig an Worker geben; ausschließlich die Taskzeile und relevante globale Gates extrahieren. |

Konkrete Regeln: keine vollständigen QA-Reports, Roadmaps, alten Sessions, HTML-Dumps, großen API-JSONs, Rohscreenshots oder irrelevanten Dateien. Große Evidenz bleibt lokal und wird per Hash/Pfad referenziert. Context Packs erhalten eine feste Dateiliste und ein Größenbudget; Überschreitung führt vor Providerstart zu Review. Funktionierende Spezifikationen bleiben unverändert und werden nicht allein wegen ihrer Zeilenzahl gekürzt.
