# Quellen und Lizenzen

Der Skill `theme-audit` ist eine gekuerzte, uebersetzte und an dieses Projekt
angepasste Fassung zweier Claude-Code-Skills. Uebernommen wurden Pruefpunkte,
ihre Kennungen und der Ablauf; nicht uebernommen wurden Code-Vorlagen zum
woertlichen Einfuegen, Marketing-Texte, nicht belegte Statistiken und Punkte
ohne Nutzen fuer diesen Shop (siehe Ende von `pruefliste.md`). Keine Hooks,
keine Skripte, keine Telemetrie - beide Upstream-Projekte bestehen nur aus
Markdown.

Bewertung aller vier gepruefter Kandidaten: `docs/audits/theme-audit-2026-10-16.md`.

| Quelle | Commit (geprueft 2026-10-16) | Lizenz | Uebernommen |
|---|---|---|---|
| https://github.com/tanujrajputdev/shopify-theme-audit-skill (v2.3) | `dbc583de1544e00eb2a03230d51303d4ad45d654` | MIT, (c) 2025 Tanuj Rajput | Ablauf, Pruefpunkte aus `audit-checklist.md`, `seo-aeo-geo-checklist.md`, `apps-audit.md`, Bewertungsschema aus `scoring.md` |
| https://github.com/yanpantoja/shopify-schema-audit (v1.2.0) | `6ac44c03196b48ca2800b3726d7196bf5baf0bb9` | MIT, (c) 2026 Yan Pantoja | JSON-LD- und Open-Graph-Pruefpunkte (Nr. 1-47) als `SD-`-Kennungen |

Aenderungen gegenueber den Quellen: deutsche Fassung; Hinweise auf die
vorhandenen Guards (`liquid:guard`, `schema:guard`, `template:guard`,
`theme:guard`, `schrift:guard`, `themecheck:guard`, `seo:check`,
`lighthouse:messen`); Regeln aus `AGENTS.md` (nur lesend, keine
Lieferantennamen/Theme-IDs, Preislogik, Rechtstexte); `llms.txt`-Pruefung
entfernt (Quellen widersprechen sich, kein belegter Nutzen); Pruefung
"Paginierte Seiten auf Seite 1 kanonisieren" umgekehrt (Google empfiehlt
selbstreferenzierende Canonicals); feste Beispielwerte (30 Tage Rueckgabe,
Versand 0 USD) durch die Regel "Werte nur aus Shop-Daten" ersetzt.

## Lizenztext (beide Quellen, jeweils mit eigenem Copyright-Vermerk)

```
MIT License

Copyright (c) 2025 Tanuj Rajput
Copyright (c) 2026 Yan Pantoja

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
