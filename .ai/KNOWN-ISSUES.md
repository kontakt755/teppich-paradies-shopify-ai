# Bekannte Grenzen

- Die deterministische Provider-Auswahl ist implementiert; produktive CLI-/API-Adapter werden weiterhin außerhalb des Core injiziert.
- Playwright erzeugt gezielte Screenshots und Messwerte. Ein modellbasierter UX-Review muss als `VISUAL_REVIEWER`-Provider Evidenz zurückgeben.
- `policyVersion: 2` ist opt-in, damit bestehende Manifeste unverändert bleiben.
