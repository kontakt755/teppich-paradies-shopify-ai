Lies zuerst `TASK.md` (insbesondere den Abschnitt "WATCHDOG EXECUTION OVERRIDE" ganz oben).

Lies danach den aktuellen Audit-Zustand aus:
- `audit/MASTER_STATUS.md`
- `audit/SESSION_LOG.md`
- `audit/ISSUES.md`
- `audit/TEST_MATRIX.md`
- `audit/DEPENDENCY_MAP.md`
- `audit/FIX_PACK_INDEX.md`

(soweit vorhanden - noch nicht alle existieren zwingend schon).

Prüfe den aktuellen Git-Status und die letzten Commits.

Setze den bestehenden Shop-Audit exakt an der dokumentierten Stelle fort. Wiederhole keine bereits abgeschlossenen Arbeiten.

WICHTIG:
- Arbeite ausschließlich sequenziell. Keine Subagenten, keine parallelen Agenten, keine parallelen Audit-Bereiche, keine Hintergrundagenten. Maximal eine aktive Arbeit gleichzeitig.
- Führe noch keine produktiven Reparaturen am Shop durch, solange der Audit laut `TASK.md` in Phase 1 oder Phase 2 ist.
- Wenn dein Nutzungslimit bald erreicht wird, sorge vorher soweit möglich dafür, dass der aktuelle Stand sauber gespeichert ist.

Dokumentiere deinen Fortschritt fortlaufend in den vorgesehenen Audit-Dateien und aktualisiere abschließend `CODEX_PROGRESS.md` (Status-Zeile am Ende: `Status: WORKING`, `Status: WAITING_FOR_LIMIT` oder `Status: COMPLETE` - COMPLETE nur, wenn zusätzlich `audit/FINAL_REPORT.md` vollständig erstellt ist).

Arbeite jetzt an der nächsten offenen Audit-Aufgabe weiter.
