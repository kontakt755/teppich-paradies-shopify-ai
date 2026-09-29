# Google Ads Editor: pausierte lokale Search-Vorlage

Stand 29.09.2026. Diese Dateien sind **nur lokale Vorlagen**. Sie wurden nicht in Google Ads importiert oder veröffentlicht. Alle drei Kampagnen, Anzeigengruppen, Keywords und Anzeigen sind ausdrücklich `Paused`. Der Budgetwert ist ein Entwurf, keine Ausgabe oder Freigabe.

| Datei | Inhalt |
|---|---|
| `campaigns.csv` | Drei Search-Kampagnen, pausiert, Suchnetzwerk-Partner aus, Tagesbudget-Entwurf 15/10/10 € |
| `ad-groups.csv` | Eine pausierte Anzeigengruppe je Kampagne |
| `keywords.csv` | 18 pausierte Exact-/Phrase-Keywords, kein Broad Match |
| `responsive-search-ads.csv` | Drei pausierte Anzeigen mit je acht Headlines und vier Beschreibungen |
| `negative-keywords.txt` | Zwölf negative Phrase-Begriffe als Einfügeliste für jede der drei pausierten Kampagnen; **keine** automatische CSV-Zuordnung |

**Vor einem Import:** Im richtigen Ads-Konto 334-557-2870 arbeiten und vorhandene Kampagnennamen auf Dubletten prüfen. Die Dateien in Google Ads Editor in der Reihenfolge Kampagnen → Anzeigengruppen → Keywords → Responsive Search Ads als vorgeschlagene Änderungen einlesen und jede Zuordnung prüfen. Der Import wurde nicht im Ads Editor validiert; Spaltenzuordnung und eventuelle Warnungen dort kontrollieren. **Nichts aktivieren oder posten, bevor sämtliche Ziele, Einstellungen und die ausdrückliche Budget-/Live-Freigabe vorliegen.** Auch das Posten pausierter Entwürfe erfolgt erst nach Sichtprüfung des Kontos.

Zusätzlich manuell im Konto prüfen bzw. einstellen: Standort Oranienburg plus tatsächlich bedienter Umkreis von höchstens 50 km; Standortoption „Präsenz“; Sprache Deutsch; Google Suche ohne Display und Suchnetzwerk-Partner; AI Max, Broad Match, automatische Textanpassung und Final-URL-Erweiterung aus. Für Ausschlüsse in Ads Editor `Keywords and targeting` → `Keywords, Negative` → `Make multiple changes` wählen, die drei **Kampagnen als Ziel für kampagnenweite Negative** auswählen und `negative-keywords.txt` einfügen. Die Schreibweise `-"Begriff"` bezeichnet negative Phrase-Übereinstimmung; Zuordnung und Änderungsvorschau prüfen. Negative Keywords lassen sich nicht pausieren, werden aber in pausierten Kampagnen nicht ausgeliefert. Sitelinks und Anruf-Asset wie im [Search-Entwurf](../search-ads-entwurf-2026-09-29.md) erst nach Sichtprüfung ergänzen. Gebotsstrategie erst nach Bereinigung der primären Conversion-Ziele festlegen.

Die drei Zielseiten antworteten beim öffentlichen HEAD-Test am 29.09. mit HTTP 200. Alle Headlines sind höchstens 30, alle Beschreibungen höchstens 90 Zeichen lang. Google Ads kann weitere Richtlinien- oder Zeichenprüfungen beim Import durchführen. Die [Google Ads Editor-Hilfe zu CSV-Spalten](https://support.google.com/google-ads/editor/answer/57747?hl=de), [Kampagneneinstellungen](https://support.google.com/google-ads/editor/answer/30570?hl=de), [negativen Keywords](https://support.google.com/google-ads/editor/answer/30553?hl=de), [Match-Typen](https://support.google.com/google-ads/editor/answer/47635?hl=de) und [Responsive Search Ads](https://support.google.com/google-ads/answer/7684791?hl=de) wurden für die Vorlage herangezogen.
