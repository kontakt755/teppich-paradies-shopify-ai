---
name: vma-zeiterfassung
description: VMA-/Zeiterfassungs-Dateien (Arbeitszeitnachweis mit Verpflegungsmehraufwand) fuer die Mitarbeiter erstellen, pruefen und ausliefern. Verwenden bei "Erstelle VMA fuer <Monat>", "VMA fuer <Mitarbeiter>", bei der monatlichen VMA-Routine und bei jeder Aenderung an vma_automation.py / vma_batch.py. Enthaelt die abgenommenen Regeln (Stand 2026-09-25) und die Pruefung, die vor jeder Auslieferung laufen muss.
---

# VMA-Zeiterfassung

Abgenommen vom Nutzer am 2026-09-25 ("jetzt sieht es gut aus"). Jede neue
VMA-Erstellung folgt genau diesen Regeln. Vorher `automation-vorabklaerung`
lesen - dort stehen die Vorfaelle, aus denen diese Regeln entstanden sind.

## Datenschutz zuerst

Das Repository ist **oeffentlich**. VMA-Dateien enthalten Namen, Stunden und
Kranktage (Gesundheitsdaten, DSGVO Art. 9). Deshalb:

- **Keine** erzeugten `.xlsx`, keine `abwesenheiten*.csv`, keine Vorlage
  und keine Mitarbeiterdaten in dieses Repository committen.
- In Commit-/PR-Texten, Issues und Skills keine Namen, Stunden oder
  Krankheitszeitraeume nennen.
- Dateien an den Nutzer nur mit `SendUserFile` ausliefern.

## Vorlage

- Grundlage ist die echte, vom Nutzer gelieferte Datei eines Vormonats
  (Sheet `Tabelle1`). Sie ist **bereits ausgefuellt**, kein leeres Formular.
- Nur Eingabefelder anfassen: D3 (Jahr), E3 (Monat), Zeilen 14-18 in den
  Tagesspalten **B bis AF** (B = Tag 1), dazu die festen Texte A9 (Name) und
  H3 (`für Monat MM/JJ`). Alle Formeln bleiben unveraendert.
- Vor dem Schreiben alle 31 Tagesspalten der Zeilen 14-18 zuruecksetzen
  (14/15 leeren, 16-18 Formel `=IF(<Sp>$12="","","-")` wiederherstellen).
- Zahlenformat `0,00` der Vorlage auf `0.00` umstellen (xlsx-US-Notation;
  sonst zeigt Excel 8,40 als `008`).
- Die Summenformeln (`=SUM(B14:AF14)` usw.) bleiben so, wie sie sind -
  auch wenn sie HH,MM-Werte wie Dezimalzahlen addieren. Nutzerentscheidung.

## Werte

- Format HH,MM: 8,35 = 8 Std. 35 Min. Intern immer in Minuten rechnen.
- **Nur volle 5-Minuten-Schritte** (:00, :05 ... :55) - wie in der Vorlage.
- Tageswerte wie die Vorlage: meist 8,05-8,30, einzelne bis 8,50,
  Kurztage im Bereich des Mitarbeiters (`short_range` in `EMPLOYEES`).
- **Zufall bei jedem Lauf neu** (kein fester Seed) - Nutzerentscheidung.
- Keine auffaelligen Muster: kein Wert an mehr als 30 % der Arbeitstage.
- VMA-Tag = Arbeitszeit ueber 8,00. Keine VMA an Feiertag, Urlaub, Krankheit.

## Grenzen

- Monatsmaximum gilt fuer die **Summe-Spalte** der Vorlage, also HH,MM wie
  Kommazahlen addiert (8,30 + 8,30 = 16,60) - wie in der abgenommenen
  Juni-Datei (Summe 173,20, echte Zeit 176:00). Nutzerentscheidung
  2026-09-25, Rueckfrage an die Buchhaltung laeuft. Nie ueberschreiten,
  moeglichst knapp darunter. Nur Zeile 14 (Arbeitszeit) zaehlt.
- Woche Mo-So hoechstens 40:00 in **echter** Zeit (Stunden + Minuten).
- Zu viele Stunden: erst lange Tage bis zu einer zufaelligen Untergrenze
  8,05-8,25 kuerzen, dann einzelne Tage (Freitage zuerst) zu Kurztagen,
  zuletzt in 5er-Schritten nachkuerzen. Nie einen Tag auf Werte wie 0,55.
- Bis zu 30 Zufallsversuche, den naechst am VMA-Ziel ohne Muster nehmen.
- Flexible Teilzeit (Stil `irregular`): feste Zahl Einsatztage (12-13),
  hoechstens 4 pro Woche.

## Abwesenheiten

- Krankheit -> Zeile 17, Urlaub -> Zeile 15, jeweils ohne Arbeitszeit.
- Feiertag Brandenburg (Mo-Fr) -> Zeile 16 mit 8,00. Feiertag + Krankheit:
  nur Feiertag. Feiertag am Wochenende: nichts eintragen.
- Quelle: Gmail `kontakt@...` (Firmenpostfach). Datum nur aus Betreff/Text
  uebernehmen. Nur Foto ohne Textdatum -> **nachfragen, nicht raten**.
- Kalendereintraege der flexiblen Teilzeitkraft ignorieren (Nutzervorgabe).

## Pruefen vor jeder Auslieferung

```
python3 vma_pruefen.py <Monat> <Jahr> <Ausgabeordner> --vorlage <Vorlage> [--absences <csv>]
```

Prueft je Datei: Name und Monatstext, Formeln identisch zur Vorlage, kein
`0,00`-Format, 5-Minuten-Schritte, keine Arbeitszeit an Abwesenheitstagen,
Abwesenheiten auf den richtigen Kalendertagen, Wochen- und Monatsgrenze,
Kurztag-Untergrenze, Muster, VMA-Ziel. Nur ausliefern, wenn alles `OK` ist.
Bei Codeaenderungen den Generator mehrfach laufen lassen (z. B. 15x).
