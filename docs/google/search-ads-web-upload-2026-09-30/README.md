# Google Ads Web-Bulk-Upload: pausierte lokale Search-Kampagnen

Stand 30.09.2026. Gleicher Inhalt wie [`search-ads-editor-import-2026-09-29/`](../search-ads-editor-import-2026-09-29/README.md), aber im Spaltenformat der offiziellen [Google-Ads-Bulk-Upload-Vorlagen](https://support.google.com/google-ads/answer/10702525?hl=de) für **Tools → Bulk-Aktionen → Uploads** (kein Ads Editor nötig). **Nicht hochgeladen.**

| Datei | Inhalt |
|---|---|
| `1-kampagnen.csv` | Drei Search-Kampagnen, `Paused`, nur `Google search`, Sprache `de`, `50 \| km \| Oranienburg, Brandenburg, Germany`, `Maximize clicks`, Tagesbudget-Entwurf 15/10/10 € |
| `2-anzeigengruppen.csv` | Eine Anzeigengruppe je Kampagne, `Paused` |
| `3-keywords.csv` | 18 Keywords, `Exact match`/`Phrase match`, `Paused` |
| `4-anzeigen.csv` | Drei Responsive Search Ads, `Paused`, je acht Headlines (≤ 30) und vier Beschreibungen (≤ 90) |

Reihenfolge 1 → 4, jeweils Vorschau prüfen, dann anwenden. Nicht per Upload abgedeckt und danach je Kampagne manuell: Standortoption „Präsenz“, kampagnenspezifisches Ziel nur `Kontaktformular`, AI Max/automatische Assets aus, max. CPC-Limit, zwölf Negative aus `../search-ads-editor-import-2026-09-29/negative-keywords.txt`, Sitelinks und Anruf-Asset. Aktivierung erst nach Lead-Nachweis und ausdrücklicher Budgetfreigabe.
