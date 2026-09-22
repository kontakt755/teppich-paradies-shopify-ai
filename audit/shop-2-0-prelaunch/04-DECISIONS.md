# Entscheidungen

| Datum | Entscheidung | Begründung |
|---|---|---|
| 2026-09-22 | Arbeit auf frischem Branch `feature/shop-2-0-prelaunch` von `origin/main`, nicht auf `audit/shop-audit` | Audit-Branch liegt 189 Commits hinter `main`; dessen Befunde (TP-001…017) werden als Referenz übernommen, nicht neu erhoben |
| 2026-09-22 | Theme-Änderungen nur per `--only` ins Arbeitstheme 204436144462, Live nur über PR → main → Deploy-Kette | Vorgabe Inhaber 2026-09-15; Live-Gate verlangt Preview = origin/main |
| 2026-09-22 | Analysen parallel (read-only Agenten), Änderungen sequenziell mit einem Writer je Datei | Auftrag § 2; TASK.md-Watchdog-Override gilt für den alten Audit-Branch |
| 2026-09-22 | Keine KI-generierten Raumbilder; Menükacheln nur mit echten Produktfotos | Auftrag § 6 Produktehrlichkeit |
