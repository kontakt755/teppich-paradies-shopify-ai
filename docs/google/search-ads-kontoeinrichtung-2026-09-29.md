# Google Ads: Kontoeinrichtung bis zur Startfreigabe

Stand 29.09.2026, Konto `334-557-2870`. **Ausführungsplan, keine Änderung im Ads-Konto.** Die Oberfläche zeigt weiterhin „Turn off ad blockers“. Alle neuen Kampagnen bleiben pausiert; das Budget ist nicht freigegeben.

## 1. Conversion-Ziele anhand der sichtbaren Aktionen prüfen

Die folgende Liste stammt aus der Conversion-Übersicht. Vor jeder Änderung die Detailseite der Aktion öffnen und Quelle, Kategorie, Zählmethode und betroffene Kampagnen kontrollieren. Vorhandene Aktionen nicht löschen: Historie und Smart-Campaign-Verknüpfungen können daran hängen.

| Sichtbare Aktion | Derzeit | Geplante Behandlung für lokale Lead-Search |
|---|---|---|
| `Google Shopping App Purchase` | primär | Als einzige Kaufaktion primär belassen. Wert/Währung/Transaktions-ID erst mit genehmigtem Kauf prüfen; für reine lokale Lead-Kampagnen nicht als Gebotsziel wählen. |
| `Google Shopping App Add To Cart`, `Google Shopping App Begin Checkout` | sekundär | Sekundär belassen. |
| `Kontaktformular` (Website) | primär, „Überprüfung erforderlich“ | Erst nach erfolgreichem echten Formularabschluss und Pixel-/Ads-Nachweis als einziges Lead-Gebotsziel der neuen Search-Kampagnen auswählen. Der Shopify-Pixel `Google Ads Lead Erfolg` sendet dieses Ziel nur nach `tp_lead_form_submit`. |
| `Kontakt` (GA4-Import), `Clicks to call` | primär | Vor einer accountweiten Umstellung Quelle und Bedeutung prüfen. Für die neuen Search-Kampagnen **nicht** als Gebotsziele wählen; Kontakt-Import und Klick sind kein nachgewiesener Formularerfolg. |
| `Calls from ads` | primär | Anrufdauer/Zählmethode prüfen. Bis zum Nachweis wertvoller Anrufe nicht als Lead-Gebotsziel der neuen Kampagnen wählen. |
| `Calls from Smart Campaign Ads`, `Smart campaign ad clicks to call`, `Smart campaign map clicks to call` | primär, teils gesperrt | Nicht löschen oder gesperrte Smart-Campaign-Aktionen erzwingen. Für die neuen Kampagnen nicht als Gebotsziele wählen. |
| `Local actions - Website visits` | primär | Seitenbesuch ist kein Lead. Für die neuen Kampagnen nicht als Gebotsziel wählen; Umstellung auf sekundär prüfen, soweit im Konto möglich. |
| `Google Shopping App Page View`, `Search`, `View Item` | sekundär | Sekundär belassen. |

Die alten pausierten Kampagnen verwenden derzeit Kontostandard-Ziele. Daher zuerst die drei neuen Kampagnen mit **kampagnenspezifischem Ziel** konfigurieren. Falls die standardmäßige Kategorie `Kontakt` mehrere Aktionen enthält, ein eigenes Ziel ausschließlich mit der bestätigten Aktion `Kontaktformular` anlegen. Kein anderes sekundäres Mikroereignis in dieses eigene Ziel aufnehmen: Google verwendet auch sekundäre Aktionen in einem benutzerdefinierten Ziel für Gebote. Danach getrennt prüfen, welche alten primären Aktionen accountweit auf sekundär gestellt werden können, ohne vorhandene Smart-Campaign-Abhängigkeiten zu verändern.

## 2. Lead und Consent nachweisen

1. Im regulären Shop-Browser Cookie-Auswahl **ablehnen** und auf der Kontaktseite prüfen, dass das Marketing-Pixel keine Lead-Übertragung meldet. Das bloße Öffnen oder Anfangen des Formulars darf keine Conversion erzeugen.
2. In einer frischen Sitzung Marketing und Analyse **akzeptieren**. Eine klar als intern markierte Anfrage durch das echte Formular inklusive hCaptcha erfolgreich absenden. Nur die sichtbare Shopify-Erfolgsbestätigung zählt als abgeschlossener Test.
3. Im Shopify Pixel Helper für `Google Ads Lead Erfolg` genau ein `tp_lead_form_submit` und die Ausführung des verbundenen Pixels prüfen; in Google Ads Diagnose/Tag Assistant den Eingang der Aktion `Kontaktformular` prüfen. Keine Formularfelder oder Kundendaten im Prüfprotokoll speichern.
4. Die Consent-Signale vor und nach Auswahl mit Tag Assistant prüfen. Bei fehlendem Event oder Doppelzählung keine Kampagne aktivieren; Ursache zuerst im Pixel, GTM und Google-&-YouTube-App abgleichen.

Eine Testbestellung ist ausdrücklich **nicht** Teil dieses kostenlosen Lead-Search-Checks. Die Kaufaktion bleibt für einen später genehmigten Shop-/Shopping-Test unbestätigt.

## 3. Pausierte Kampagnen übernehmen

Nach Kontozugriff und Lead-Nachweis: bestehende Kampagnennamen auf Dubletten prüfen, dann die vier CSV-Dateien und die negative Liste aus [`search-ads-editor-import-2026-09-29/`](search-ads-editor-import-2026-09-29/README.md) als vorgeschlagene Änderungen prüfen. Drei Kampagnen, Anzeigengruppen, 18 Keywords und drei Anzeigen müssen `Paused` bleiben. Im Konto kontrollieren: Präsenz im tatsächlichen 50-km-Servicegebiet, Deutsch, Google Suche ohne Suchpartner/Display, keine AI-Max-/Broad-/PMax-Erweiterung, passende Sitelinks und Anrufzeiten. Gebotsstrategie und Tagesbudget erst nach Zielprüfung festlegen; 15/10/10 € pro Tag sind nur der Entwurf.

## 4. Startgrenze

**GO für lokale Search Ads** erst nach: Ads-Zielauswahl sichtbar geprüft, erfolgreicher Lead, Consent-Test bestanden, pausierte Kampagnen und Assets im Konto geprüft, ausdrückliche Freigabe von Tagesbudget und Aktivierung. Die Aktivierung selbst ist eine gesonderte Handlung; bis dahin entstehen durch diese Entwürfe keine Anzeigenkosten.

Google-Hilfe: [primäre/sekundäre Aktionen und Kontoziele](https://support.google.com/google-ads/answer/10995103?hl=de), [kampagnenspezifische Ziele und Verhalten benutzerdefinierter Ziele](https://support.google.com/google-ads/answer/9143218?hl=de), [Ziele in der Conversion-Übersicht bearbeiten](https://support.google.com/google-ads/answer/10993988?hl=de).
