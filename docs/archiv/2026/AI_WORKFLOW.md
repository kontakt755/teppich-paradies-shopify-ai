# 🤖 KI-Orchestrierungs-Workflow

Dieser Leitfaden definiert, wie Claude, Codex und ChatGPT zusammenarbeiten um Aufgaben zu bearbeiten.

## Rollen der Agenten

### Claude (Implementierer)
- **Aufgaben:** Code schreiben, Bugs beheben, Features implementieren
- **Fähigkeiten:** Vollständige Programmierung, Problem-Analyse, Refactoring
- **Output:** Code-Changes, Pull Requests, verbesserte Features
- **Status:** Wird zugewiesen, wenn Implementierung startet

### Codex (Reviewer/Qualitätskontrolle)
- **Aufgaben:** Code-Review, Qualitätsprüfung, Fehleranalyse
- **Fähigkeiten:** Code-Verständnis, Best Practices, Bug-Erkennung
- **Output:** Review-Kommentare, Findings, Genehmigung
- **Status:** Wird nach Claude zugewiesen, wenn Code zur Review geht

### ChatGPT (Orchestrator/Stratege)
- **Aufgaben:** Aufgaben strukturieren, Ideen sammeln, Priorisierung
- **Fähigkeiten:** Requirement-Analyse, Kommunikation, Prioritäts-Management
- **Output:** Issues erstellen/aktualisieren, Handoff-Koordination
- **Status:** Kann jederzeit Aufgaben verwalten

### Ahmet/Mensch (Produktowner)
- **Aufgaben:** Finale Genehmigung, Business-Entscheidungen
- **Fähigkeiten:** Produktvision, Kundenverständnis, Stakeholder-Management
- **Output:** Genehmigung, Prioritäts-Entscheidungen
- **Status:** Wird bei kritischen Aufgaben konsultiert

---

## Standard-Workflow

### Phase 1: Issue erstellen

**Wer:** ChatGPT oder Mensch  
**Wo:** GitHub Issue  
**Wie:** Nutze Issue-Templates (Bug/Feature/Idee)

```
1. Titel schreiben
2. Beschreibung ausfüllen
3. Labels hinzufügen:
   - status:eingang
   - type:* (bug/feature/idee)
   - priority:* (p0-p3)
   - area:* (optional)
4. Issue erstellen
```

**Beispiel:**
```
Title: Produktgalerie responsive machen
Labels: type:bug, priority:p1, area:produktseite, status:eingang
Body:
Problem: Produktgalerie funktioniert auf Mobilgeräten nicht
Soll-Zustand: Bilder sollten responsive sein
```

### Phase 2: Issue besprechen & planen

**Wer:** Mensch, ChatGPT, Claude optional  
**Status Update:**
```
status:eingang → status:geplant
```

**Aufgaben:**
- Anforderungen klären
- Akzeptanzkriterien definieren
- Priorität final entscheiden
- Claude zuweisen

**Comment im Issue:**
```
ChatGPT / Mensch:

Die Produktgalerie muss responsive sein.

Anforderungen:
- [ ] Desktop-Zoom funktioniert
- [ ] Mobile-Zoom funktioniert
- [ ] Performance bleibt OK

Claude, bitte wenn bereit: implementieren
```

### Phase 3: Claude implementiert

**Wer:** Claude  
**Bearbeiter:** Claude (assignee)  
**Status Update:**
```
status:geplant → status:in-arbeit
```

**Aufgaben:**
- Code schreiben
- Tests durchführen
- Pull Request erstellen
- Link in Issue-Comment posten

**Comment im Issue:**
```
Claude:

Implementierung gestartet.
PR: https://github.com/.../pull/123

Tests: 
- [ ] Desktop Zoom
- [ ] Mobile Zoom
- [ ] Performance

Codex, wenn bereit: Review bitte
```

### Phase 4: Codex prüft (Code Review)

**Wer:** Codex  
**Status Update:**
```
status:in-arbeit → status:review
```

**Aufgaben:**
- Code-Quality prüfen
- Best Practices überprüfen
- Performance checken
- Buggy Code erkennen

**Möglich Results:**

#### ✅ Approved:
```
status:review → status:fertig
Codex Comment: Code-Quality ✓. Merge OK.
```

#### 🔨 Findings/Fehler:
```
status:review → status:korrektur
Codex Comment: 
- Line 42: Performance Issue - nutze Map statt forEach
- Line 78: Mobile-Darstellung kaputt bei iOS
```

### Phase 5: Claude behebt Findings

**Wer:** Claude  
**Status Update:**
```
status:korrektur → status:in-arbeit
```

**Aufgaben:**
- Findings beheben
- PR aktualisieren
- Findings abarbeiten

**Comment:**
```
Claude:

Findings behoben:
✓ Performance-Loop optimiert
✓ iOS-Issue behoben

Codex, bitte erneut review
```

### Phase 6: Codex gibt Freigabe

**Status Update:**
```
status:in-arbeit → status:review → status:fertig
```

**Finale Steps:**
- PR mergen
- Deploy (falls automatisch) oder manuell deployed
- Issue schließen

**Comment:**
```
Codex:

Re-Review: Alles OK ✓
PR merged.
Deployed to production.

Issue closed. ✅
```

---

## Blockierte Aufgaben

Wenn eine Aufgabe nicht vorankommt:

```
status:* → status:blockiert
```

**Im Comment erklären:**
```
Claude:

Ich bin blockiert:
- Warte auf API-Key von Ahmet
- Shopify Admin API antwortet nicht
- Abhängig von #456

Ahmet bitte API-Key schreiben, danach kann ich weitermachen.
```

**Follow-up:**
- ChatGPT/Mensch überprüft Block
- Block entfernen/lösen
- Status zurück zu `status:in-arbeit` oder `status:geplant`

---

## Handoff zwischen Agenten

### Claude → Codex

**Claude schreibt:**
```
Codex, habe die Aufgabe implementiert.
PR: #123
Bitte Review durchführen.
```

**Automatisch:**
- Status: in-arbeit → review
- Codex bekam Benachrichtigung
- Reviewer-Label: reviewer:codex

### Codex → Claude

**Codex schreibt:**
```
3 Findings gefunden:
1. Line 42: ...
2. Line 78: ...
3. Line 95: ...

Claude, bitte beheben.
```

**Automatisch:**
- Status: review → korrektur
- Claude bekam Benachrichtigung

### ChatGPT → Claude/Codex

**ChatGPT erstellt Issue:**
```
Title: Neue Feature xyz
Labels: status:geplant, type:verbesserung
Assignee: Claude (wenn sofort starten)
```

### Feedback-Loop

Die Nächste-Schritte Sektion im Dashboard zeigt:

```
🎯 Was ist jetzt zu tun?

1. Produktgalerie Review
   Status: Review
   Nächster Schritt: → Codex prüft mobile Darstellung
   PR: #82

2. Filter-Performance
   Status: Korrektur
   Nächster Schritt: → Claude behebt Memory-Leak
```

---

## Kommunikation im GitHub Issue

### Struktur von Comments

```
[Agent Name]:

[Kurze Zusammenfassung]

[Details/Findings/Code]

[Status Update]:
- [ ] Done
- [ ] In Progress
- [ ] Blocked

[Nächster Schritt]:
[Wer macht was]

[Links]: PR #123, Issue #456
```

### Beispiel 1: Claude Start

```
Claude:

Implementierung der Produktgalerie gestartet.

Status: 
- [x] Responsive CSS geschrieben
- [x] Desktop getestet
- [ ] Mobile testen (läuft)
- [ ] Performance testen

Nächster Schritt:
Mobiltests abschließen → PR erstellen → Codex Review

PR Preview: https://github.com/... (sobald erstellt)
```

### Beispiel 2: Codex Findings

```
Codex:

Code-Review durchgeführt.
Qualität: 8/10

Findings:
1. **Line 45 - Performance:** forEach → .map() nutzen
   Impact: +200ms bei vielen Produkten
   
2. **Line 78 - Bug:** iOS Safari - transform: scale nicht gecacht
   Impact: Flickering auf iPhone
   
3. **Sonstiges:** Guter Code, schöne Struktur!

Nächster Schritt:
Claude behebt diese 2 Items → Erneut Review

Blocked if not fixed: Nein (optionales Cleanup möglich)
```

### Beispiel 3: Claude Follow-up

```
Claude:

Findings behoben ✓

- ✓ forEach → map() in Line 45
- ✓ iOS Safari Fix in Line 78 + CSS-Animation gecacht

Nächster Schritt:
Codex bitte erneut Review

Tests bestanden:
- Desktop Zoom ✓
- Mobile Zoom ✓
- iOS Safari ✓
- Performance +500ms noch OK ✓
```

---

## Nächste Schritte im Issue

Jedes aktive Issue sollte einen klaren "Nächsten Schritt" haben.

**Im Issue-Body:**
```md
## Nächster Schritt

Claude behebt die Findings aus dem Codex-Review:
- Line 42: Performande-Loop
- Line 78: iOS-Bug

Nach Fertig → Codex erhält Benachrichtigung
```

**Im Dashboard sichtbar als:**
```
Produktgalerie Fix
Status: Korrektur
→ Claude behebt Performance- und iOS-Bug
```

---

## Fehlerhafte Übergaben verhindern

❌ **Falsch:**
```
Claude schreibt einfach PR ohne Comment
PR wurde erstellt, aber Codex weiß nicht Bescheid
```

✅ **Richtig:**
```
Claude schreibt Comment:
"PR #123 erstellt, bitte Review durchführen"
Codex erhält Notification
```

---

## Automatisierungen & Zukünftige Erweiterungen

Diese könnten später automatisiert werden:

- [ ] Auto-Assign Codex wenn PR erstellt
- [ ] Auto-Label `status:review` wenn PR ready
- [ ] Slack-Notification für Handoffs
- [ ] Auto-Deploy wenn Codex approved
- [ ] Dashboard Auto-Refresh bei Label-Change

---

## Dashboard-Integration

Das Dashboard zeigt den aktuellen Workflow-Status:

- **Metriken:** Wie viele Issues in jedem Status?
- **Kanban:** Welche Issues sind wo?
- **Nächste Schritte:** Was ist jetzt sofort zu tun?
- **Agenten-Handoffs:** Wer ist gerade dran?

**Label = Status = Dashboard-Position**

Wenn du ein Label änderst, aktualisiert sich das Dashboard automatisch alle 2 Minuten.

---

## Troubleshooting

### Issue ist steckengeblieben
→ Nutze `status:blockiert` Label  
→ Erkläre im Comment, warum  
→ Tag die Person, die unblocked  

### Codex Review dauert lange
→ Schreib Comment: "@codex, Review noch offen?"  
→ Checke ob PR OK ist  
→ Ping auf Slack falls verfügbar  

### Claude hat Fehler gemacht
→ Codex schreibt Findings  
→ Claude behebt es  
→ Erneuter Review  
→ Repeat bis OK  

### Mensch muss entscheiden
→ Nutze `status:blockiert`  
→ Tag Mensch im Comment  
→ Warte auf Entscheidung  
→ Workflow weiter  

---

## Schnell-Checkliste für neue Issues

- [ ] Titel ist klar und kurz
- [ ] `status:eingang` Label gesetzt
- [ ] `type:*` Label gesetzt (bug/feature/idee)
- [ ] `priority:*` Label gesetzt (p0-p3)
- [ ] `area:*` Label optional gesetzt
- [ ] Beschreibung ist ausführlich
- [ ] Akzeptanzkriterien definiert
- [ ] "Nächster Schritt" ist klar
- [ ] Issue wird nicht duplex zu bestehendem

Dann ist die Aufgabe bereit für Claude!
