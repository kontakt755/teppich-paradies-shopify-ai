---
name: automation-vorabklaerung
description: Checkliste VOR dem Bau jeder Automation, die externe Connectors (Gmail, Calendar, Drive, ...) braucht, fertige Dateien an den Nutzer ausliefern soll, oder in eine bestehende Excel-/Dokument-Vorlage schreibt. Verwenden, bevor Scanner-Skripte, Scheduled Routines, Datei-Auslieferung oder Excel-Schreiblogik gebaut werden - nicht danach. Vorfaelle: VMA-Zeiterfassungs-Automation (2026-09-24) - Gmail-Kontoverwechslung UND ein 2-Spalten-Offset-Bug, der wochenlang unbemerkt falsche Kalendertage befuellt haette.
---

# Automation-Vorabklaerung

Diese Checkliste **vor** dem ersten Code-Zeile fuer eine Automation abarbeiten,
die (a) einen externen Connector braucht oder (b) fertige Dateien an den Nutzer
liefern soll. Jeder Punkt hier hat in einer echten Sitzung Zeit gekostet, weil
er uebersprungen oder zu spaet gemacht wurde.

## 1. Connector-Realitaet zuerst pruefen, nie annehmen

**Bevor** irgendein Scanner-Skript, Suchlogik oder Doku geschrieben wird:

```
ListConnectors(keywords: [...])   # welche Connectors sind ueberhaupt verbunden?
```

- Ein **eigenstaendiges Python/Node-Skript hat NIEMALS Zugriff auf MCP-Tools**
  (Gmail, Calendar, Drive, etc.) - nur eine laufende Claude-Session hat das.
  Wenn die Automation "automatisch laufen" soll, ist die einzige Option eine
  **Routine/Trigger, die eine Claude-Session weckt** und die MCP-Tools direkt
  aufruft. Ein Platzhalter-Skript, das "spaeter mit MCP verbunden wird", ist
  Zeitverschwendung - es wird nie funktionieren.
- Existiert das gewuenschte Tool ueberhaupt (z. B. "Anhang herunterladen")?
  Einmal grruendlich mit `ToolSearch` pruefen (mehrere Formulierungen). Kommt
  nichts, ist das ein Fakt, kein Anlass fuer eine zweite/dritte Suche mit
  anderen Keywords - stattdessen dem Nutzer die reale Grenze nennen und
  Alternativen anbieten (Prozess-Fix, manueller Fallback, externe API).

## 2. Kontoidentitaet verifizieren, bevor in die Breite gesucht wird

Ein verbundener Connector sagt nichts darueber, **welches Konto** dahinter
haengt. Vor jeder inhaltlichen Suche (Keywords, Datumsbereiche):

- Eine einzelne Testsuche machen und den **Absender/Kontext der ersten
  Treffer** pruefen. Sind es Firmen-Mails oder private Newsletter? Passt die
  Domain zum erwarteten Postfach?
- Erst wenn die Kontoidentitaet bestaetigt ist, die eigentliche (breitere)
  Suche starten. Alles andere produziert stundenlange Sackgassen-Recherche im
  falschen Postfach.

## 3. Fakten verifizieren statt annehmen/hardcoden

Adressen, IDs, Namen etc., die aus einer fruehen Beschreibung des Nutzers
stammen ("die Mail geht an X"), **immer** mit einer echten Suche/Abfrage
gegenpruefen, bevor sie in Code oder Doku landen. Eine falsche Annahme
(z. B. falsche Domain-Endung) zieht sich sonst durch mehrere Dateien und
Commits, bis sie durch Zufall auffaellt.

## 4. Scope-Grenze klaeren, bevor eine Loesung im Detail designt wird

Wenn eine moegliche Loesung ueber das offensichtlich Erlaubte hinausgeht
(neue externe API, eigenes Cloud-Projekt, Kosten, Zugriff auf ein Drittsystem)
- **erst kurz fragen, ob das ueberhaupt in Frage kommt**, dann erst den
  vollen Plan/Prompt ausformulieren. Ein fertig ausgearbeitetes Konzept, das
  der Nutzer dann ablehnt, ist verlorene Arbeit.
- Als Fallback-Notiz dokumentieren ("fuer spaeter"), nicht implementieren.

## 5. Dateien an den Nutzer liefern: das richtige Werkzeug waehlen

- Soll der Nutzer eine fertige Datei einfach **bekommen/pruefen**: `SendUserFile`
  verwenden. Direkt, kein Umweg.
- Nur wenn explizit eine **E-Mail mit Anhang aus einem bestimmten Postfach**
  verlangt ist, den Umweg ueber `create_draft`/`send_message` mit
  Base64-Anhaengen gehen - und dann in **einem** Rutsch:
  - Datei einmal base64-kodieren, **direkt und vollstaendig** in den
    Tool-Call einsetzen (nie Platzhalter-Text einsetzen und "spaeter
    ersetzen" - das fuehrt zu Fehlversuchen).
  - Bei mehreren Anhaengen: alle Base64-Inhalte in einem Read-Batch holen,
    dann **einen** `create_draft`-Aufruf mit allen echten Inhalten machen.
  - Das ist trotzdem langsamer und fehleranfaelliger als `SendUserFile` -
    im Zweifel nachfragen, ob eine echte E-Mail noetig ist oder ob
    "Datei zeigen" reicht.

## 6. Neue Fakten vom Nutzer sofort uebernehmen, nicht neu herleiten

Wenn der Nutzer eine Korrektur oder fehlende Information nachliefert (z. B.
ein genaues Datum), diese direkt in den naechsten Schritt einbauen - nicht
nochmal spekulieren oder den alten (geschaetzten) Stand weiterverwenden.

## 7. Schreiben in bestehende Excel-/Dokument-Vorlagen: nie blind vertrauen

**Vorfall (2026-09-24):** Ein VMA-Generator schrieb Arbeitszeit/Krankheit
2 Kalendertage zu spaet, weil eine Spalten-Konstante (`DAYS_COLUMNS`) falsch
hart codiert war (Start bei Spalte D statt B) - und niemand hat das gegen die
eigene Tages-Kopfzeile der Datei geprueft, bis der Nutzer es im fertigen
Excel von Hand nachgezaehlt hat. Ein zweiter, noch gefaehrlicherer Bug lag
daneben: Die "Vorlage" war keine leere Datei, sondern eine bereits mit
echten Werten eines fruehren Monats ausgefuellte Datei. Weil der Schreib-Code
nur schrieb, wenn ein neuer Wert > 0 war (statt Felder zuerst zu leeren),
blieben an Kranktagen die alten Arbeitszeiten aus dem Vormonat einfach stehen.

**Daraus folgt fuer JEDE Automation, die in eine bestehende Datei
(Excel/Word/etc.) schreibt, nicht in eine leere:**

- **Spalten-/Zeilen-Konstanten nie aus dem Gedaechtnis/einer Doku-Zeile
  hart codieren, ohne sie gegen die Datei selbst zu verifizieren.** Bei
  Excel: die Kopfzeilen-Formel der Datei lesen (z. B. `=DATE($D$3,$E$3,
  COLUMN()-1)` in Zeile 12) und pruefen, welche Spalte wirklich Tag 1 ist -
  nicht einfach eine Konstante aus einer fruehen Analyse uebernehmen.
- **Nach dem Schreiben immer zurücklesen und stichprobenartig gegen den
  echten Kalender pruefen** (z. B. "Krankheit 18.-25.09. eingetragen -
  steht das wirklich unter den Spalten fuer Tag 18-25, nicht 16-23 oder
  20-27?"). Ein Validierungsschritt, der nur "Summe <= Max" prueft, faengt
  einen Spalten-Offset NICHT ab - er muss explizit Tag-fuer-Tag gegen den
  Kalender pruefen.
- **Wenn die Vorlage eine bereits ausgefuellte Datei eines anderen Zeitraums
  ist** (nicht leer): vor dem Schreiben ALLE Eingabefelder des neuen
  Zeitraums explizit zuruecksetzen/leeren (bzw. Formel-Defaults
  wiederherstellen), nicht nur bedingt ueberschreiben. "Ich schreibe nur
  wenn ein Wert vorhanden ist" reicht nicht, wenn die Zelle vorher schon
  einen (falschen, alten) Wert enthalten kann.
- **Zahlenformate pruefen, nicht nur Werte.** xlsx speichert Formate in
  US-Notation: `0,00` heisst dort "Tausendertrenner", Excel zeigt 8,40 dann
  als `008`. Richtig ist `0.00` (deutsches Excel zeigt `8,40`). Ein Zurücklesen
  der Werte mit openpyxl zeigt den Fehler nicht, nur das `number_format`.
- **Werte-Stil an der echten Referenzdatei ablesen** (z. B. nur 5-Minuten-
  Schritte), nicht aus der Beschreibung ableiten.
- **Feste Texte der Vorlage suchen** (Name, "für Monat 06/26"): Sie sind
  keine Formeln und bleiben sonst in jeder neuen Datei stehen.
- **Zufallsgeneratoren ueber viele Laeufe pruefen** (z. B. 15x), nicht einen.
  Kuerzungen verteilen statt einen Tag auf 0,55 zu druecken, und auf
  Muster pruefen (ein Wert an mehr als 30 % der Tage).
- Diese Klasse Bug ist besonders gefaehrlich, weil `validate_workbook()`-
  artige Pruefungen (Max-Stunden, Wochenlimit) sie **nicht** entdecken - die
  Summen koennen zufaellig plausibel bleiben, obwohl die Tage falsch liegen.

## Kurzform zum Selbst-Abhaken

- [ ] `ListConnectors` geprueft, bevor Code/Doku geschrieben wurde
- [ ] Kontoidentitaet mit einer Testsuche bestaetigt
- [ ] Keine eigenstaendigen Skripte gebaut, die MCP-Zugriff voraussetzen
- [ ] Angenommene Fakten (Adressen, IDs) verifiziert statt hardcoded
- [ ] Scope-Grenze (externe APIs, Kosten) kurz erfragt vor Full-Design
- [ ] Datei-Auslieferung: `SendUserFile` statt Base64-Mail-Draft, wenn moeglich
- [ ] Spalten-/Zeilen-Konstanten fuer Excel-Schreibzugriff gegen die
      Datei selbst verifiziert (Kopfzeilen-Formel lesen), nicht nur codiert
- [ ] Nach dem Schreiben: Tag-fuer-Tag-Stichprobe gegen echten Kalender,
      nicht nur Summen-/Max-Pruefung
- [ ] Bei vorausgefuellter Vorlage: Eingabefelder vor dem Schreiben explizit
      zurueckgesetzt, nicht nur bedingt ueberschrieben
