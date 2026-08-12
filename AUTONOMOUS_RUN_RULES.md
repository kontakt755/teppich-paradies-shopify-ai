# Autonomous Run Rules

Version: 1.0  
Gültig für LOW-/MEDIUM-Startmanifeste. HIGH ist ausgeschlossen.

## 1. Vorbedingungen

- genehmigtes, eingefrorenes Startmanifest
- privates Git-Repository mit sauberem Task-Ausgangspunkt
- LF-Normalisierung und `.gitignore`
- Secret-Scan verfügbar
- Domain Pack validiert
- Budget für Modellaufrufe und maximale Wanduhrzeit gesetzt
- Live-Backup und Git-Tag vorhanden
- unveröffentlichtes Dev Theme als Ziel
- Restore-Probe vor erstem Langlauf bestanden
- kein Worker schreibt direkt auf das Live-Theme

## 2. Laufsequenz

1. Manifest und Domain Pack schematisch validieren.
2. Budgets, Locks, Working Tree und Dev-Ziel prüfen.
3. Tasks topologisch nach Abhängigkeiten sortieren.
4. HIGH nach `needs-ahmet.md` schreiben und überspringen.
5. Für nächsten zulässigen Task deterministischen Preflight ausführen.
6. Kleines Task Context Pack erzeugen.
7. Frische Worker-Session starten.
8. Nach Schreibschritten Allowlist, Risiko und Diff-Budget prüfen.
9. Deterministische QA ausführen.
10. PASS speichern oder Retry-/Parklogik anwenden.
11. Abhängige Tasks bei endgültigem Block als `SKIPPED_DEPENDENCY` markieren.
12. Laufabschluss bestimmen und einmal benachrichtigen.

## 3. Fail- und Restore-Regeln

LOW hat höchstens zwei, MEDIUM höchstens drei Implementierungsversuche. Nach jedem FAIL:

- erste relevante Assertion, URL, Datei, Zeile und maximal 30 relevante Logzeilen sichern
- Diff bei Bedarf als Artefakt sichern
- Working Tree exakt auf Task-Start zurücksetzen
- Restore deterministisch verifizieren
- frische Session verwenden

Diagnose darf lesen und berichten, aber keinen Implementierungsdiff hinterlassen. Geparkte Tasks werden von späteren Läufen ignoriert, bis ein neues genehmigtes Manifest sie reaktiviert.

## 4. Logfilter

- QA: erste relevante Assertion plus maximal 30 Zeilen
- API/curl: vor Übergabe per `jq`, PowerShell Select-Object oder kleinem Parser filtern
- Dateisuche: zuerst nur Pfade; Inhalte erst aus relevanten Dateien
- HTML: nur relevante Selektoren/JSON-LD-Blöcke, kein Gesamtdump
- Diff: Diffstat zuerst, danach nur erlaubte relevante Hunks
- Reviewer: keine vollständige alte Session

Rohartefakte können lokal aufbewahrt werden, werden aber nie ungefiltert in Modellkontext kopiert.

## 5. Hard Stops

Sofort stoppen bei:

- Datei außerhalb `ALLOWED_FILES`
- tatsächlichem Risiko oberhalb Task-Freigabe
- Secret oder personenbezogenen Daten im Modellkontext/Diff
- Schreibziel Live oder Fallback
- unbekannter externer Mutation
- nicht verifizierbarem Restore
- konkurrierendem Working-Tree-Writer
- Manipulation von Prüfungen, um einen FAIL künstlich zu verdecken

Ein Hard Stop wird gespeichert und benachrichtigt. Andere Tasks dürfen nur weiterlaufen, wenn der Verstoß sicher isoliert, der Tree sauber und die globale Integrität bestätigt ist.

## 6. Abbruchbedingungen

Der Lauf endet beim ersten zutreffenden Ereignis:

1. Alle freigegebenen Tasks sind `PASS`, `PARKED`, `SKIPPED_DEPENDENCY` oder `NEEDS_AHMET`.
2. Definiertes Modell-/Aufrufslimit ist erreicht.
3. Maximale Wanduhrzeit ist erreicht.
4. Globaler Hard Stop verhindert sichere Fortsetzung.

Wanduhrzeit ist Sicherheitsgrenze, kein Beschäftigungsziel.

## 7. ROADMAP BLOCK COMPLETE

Exakte Definition: Jeder im Startmanifest enthaltene LOW-/MEDIUM-Task besitzt `PASS`, `PARKED`, `SKIPPED_DEPENDENCY` oder `NEEDS_AHMET`; kein Task ist `RUNNING` oder `PENDING`. Außerhalb des Startmanifests entdeckte Vorschläge beeinflussen den Status nicht.

## 8. Notifications

ntfy und lokaler Windows-Sound nur bei Laufende, Hard Stop, Allowlist-Verstoß, Providerwechsel, HIGH wartet auf Ahmet oder schwerem technischen Blocker. Kein Signal für einzelne normale PASS-Tasks.

## 9. Git und Theme-Lifecycle

```text
Live Backup -> Git Tag -> unveröffentlichtes Dev Theme
-> autonome LOW/MEDIUM-Tasks -> QA -> Abschlussbericht
-> menschliche Prüfung -> separater HIGH-Publish-Task
```

`theme publish` bleibt immer ein menschliches Gate. Fallback-Theme `196301750606` ist technisch deny-listed.

## 10. Abschlussartefakte

- Laufzusammenfassung
- Task-State-Datei
- `parked-tasks.md`
- `needs-ahmet.md`
- Test-/Diffstat-Zusammenfassung
- Providertelemetrie
- Restore-/Secret-Scan-Status
- Vorschläge für ein späteres, neues Manifest
