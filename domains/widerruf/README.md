# Widerrufsfunktion (§ 356a BGB)

Pflicht seit 19.06.2026: ständig erreichbare, hervorgehobene Funktion
„Vertrag widerrufen“, zweistufig mit „Widerruf bestätigen“, danach sofort eine
Eingangsbestätigung mit Inhalt, Datum und Uhrzeit auf dauerhaftem Datenträger.
Fehlt sie, verlängert sich die Widerrufsfrist auf 12 Monate + 14 Tage.

## Bausteine

| Teil | Ort |
|---|---|
| Footer-Link „Vertrag widerrufen“ (fest, nicht im Menü) | `blocks/tp-footer-links.liquid` |
| Seite `/pages/vertrag-widerrufen` | `templates/page.vertrag-widerrufen.json` → `sections/tp-widerruf.liquid` |
| Empfänger: Protokoll + Eingangsbestätigung + Kopie an kontakt@ | `domains/widerruf/apps-script/` (Google Apps Script, Firmenkonto) |
| Hinweis in der Widerrufsbelehrung (Gestaltungshinweis 3) | Shopify-Richtlinie „Widerrufsrecht“ (Admin) |

Warum Apps Script: Shopify Flow kann nur intern mailen („Send internal email“,
Empfänger nicht per Variable), das Kontaktformular löst keinen Flow aus, und
Shopifys eigene Rückgabe-/Stornoanfrage braucht ein Kundenkonto. Apps-Store-Apps
wollen meist Lese-/Schreibzugriff auf Kunden und Bestellungen. Apps Script im
Firmenkonto kostet nichts und verschickt von kontakt@.

## Web-App bereitstellen

1. script.google.com im Konto kontakt@teppich-paradies.net → neues Projekt
   „Shop – Widerrufsfunktion“, `Code.js` und `appsscript.json` (Manifest im
   Editor einblenden) einfügen.
2. Funktion `einrichten` einmal ausführen → Berechtigungen bestätigen (Mail
   senden, Tabellen). Legt das Protokoll-Sheet „Widerrufe Shop
   (Eingangsprotokoll)“ an und merkt sich die ID in den Script-Properties.
3. Bereitstellen → Neue Bereitstellung → Web-App, Ausführen als: ich, Zugriff:
   Jeder. Die `/exec`-Adresse in `templates/page.vertrag-widerrufen.json`
   (`endpoint`) eintragen.
4. Code-Änderungen: neue Version unter derselben Bereitstellung („Bereitstellungen
   verwalten“ → Bearbeiten → Neue Version), damit die Adresse gleich bleibt.

## Prüfen

- `GET <exec>` liefert `{"ok":true,"dienst":"widerruf"}`.
- Test-Widerruf mit eigener Adresse über die Seite: Mail an den Kunden mit
  Datum/Uhrzeit/Vorgangsnummer, Kopie an kontakt@, Zeile im Protokoll.
- Missbrauchsbremse: 3 Einsendungen je Adresse pro Stunde (danach abgewiesen); ab 40 insgesamt pro Stunde und bei gefuelltem
  Honigtopffeld `website` wird protokolliert und intern gemeldet, aber nicht an die Adresse gemailt. Gleiche `id` (je Zusammenfassung) = keine zweite Mail.
