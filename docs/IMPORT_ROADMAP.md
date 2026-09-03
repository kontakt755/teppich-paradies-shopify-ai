# 🚀 Roadmap in Dashboard importieren

Automatische Konvertierung von `SHOPIFY_MASTER_ROADMAP.md` zu GitHub Issues.

## 🎯 Was passiert

Die ROADMAP hat 27 Tasks (SHP-001 bis SHP-027):

```
Gesamt: 27 Tasks
├─ LOW Risk: 10
├─ MEDIUM Risk: 12
└─ HIGH Risk: 5 (Human Gates)
```

**Diese werden konvertiert zu:**

```
GitHub Issues mit Labels:
├─ status:eingang/geplant/blockiert
├─ priority:p0/p1/p2/p3
├─ type:technik/verbesserung/ux/content
├─ area:backend/produktseite/navigation
└─ roadmap:sph (markiert als Roadmap)
```

## 📋 Aktuelle Roadmap-Tasks

| ID | Titel | Risk | Status | Worker |
|---|---|---|---|---|
| SHP-001 | Repository-Portabilität | MEDIUM | Geplant | Codex |
| SHP-002 | Backup-/Restore-Drill | MEDIUM | Geplant | Codex |
| SHP-003 | QA-Logfilter | LOW | Eingang | Codex |
| SHP-004 | Manifest-/State-Runner | MEDIUM | Geplant | Codex |
| SHP-005 | Deterministischer Risk Guard | MEDIUM | Geplant | Codex |
| SHP-006 | Diff-Budget Guard | LOW | Eingang | Codex |
| SHP-007 | Secret-Scan-Gate | LOW | Eingang | Codex |
| SHP-008 | Notification Policy | LOW | Geplant | Codex |
| SHP-009 | 45-Minuten-Sicherheitstest | MEDIUM | Blockiert | Codex + Claude (Gate: JA) |
| SHP-010 | Windows-SEO-Tooling | MEDIUM | Eingang | Codex |
| SHP-011 | Kategoriebild-Regressionssuite | MEDIUM | Eingang | Codex |
| SHP-012 | Teppichboden-Menü-Audit | LOW | Geplant | ChatGPT Work |
| SHP-013 | Teppichboden-Menü korrigieren | HIGH | Blockiert | Codex (Gate: JA) |
| SHP-014 | Florhöhen-/ecoVella-Audit | LOW | Geplant | ChatGPT Work |
| SHP-015 | Live-Collection-Zuordnungen | HIGH | Blockiert | Codex (Gate: JA) |
| SHP-016 | Sisal-&-Natur-Spezifikation | LOW | Geplant | ChatGPT Work |
| SHP-017 | Sisal Dev-Theme-Prototyp | MEDIUM | Eingang | Codex |
| SHP-018 | Jordan-Pipeline-Validator | LOW | Eingang | Codex |
| SHP-019 | Jordan Draft Dry Run | MEDIUM | Eingang | Codex |
| SHP-020 | Bildinventar & Lizenzstatus | LOW | Geplant | ChatGPT Work |
| SHP-021 | Accessibility-Baseline | LOW | Eingang | Codex |
| SHP-022 | Kleine Accessibility-Fixes | MEDIUM | Eingang | Codex |
| SHP-023 | Google-Kanalausschluss Rollenware | HIGH | Blockiert | Ahmet + Worker (Gate: JA) |
| SHP-024 | Merchant-Zielarchitektur Rollenware | MEDIUM | Geplant | ChatGPT Work |
| SHP-025 | OPC-/Softiq-Datenbereinigung | HIGH | Blockiert | Codex (Gate: JA) |
| SHP-026 | Human-gated Live Release | HIGH | Blockiert | Ahmet + Codex (Gate: JA) |
| SHP-027 | Performance-Budget | MEDIUM | Eingang | Codex |

---

## 🔄 Wie man Issues manuell erstellt (falls Script fehlschlägt)

**GitHub Issues → New Issue → Verwende dieses Format:**

```markdown
SHP-XXX: [Titel]

## Ziel
[Kurzbeschreibung des Ziels]

## Worker
[Wer arbeitet dran]

## Risk Level
[LOW/MEDIUM/HIGH]

## Abhängigkeiten
[SHP-XXX, SHP-YYY, oder -]

## Akzeptanzkriterien
- [ ] Kriterium 1
- [ ] Kriterium 2

## Größe
[S/M/L]

## Nächster Schritt
[Was ist zu tun]
```

**Labels hinzufügen:**
- `type:technik` oder `type:verbesserung`
- `priority:p1` (HIGH Risk) oder `priority:p2`
- `area:backend` oder `area:produktseite`
- Falls HIGH Risk mit Human Gate: `status:blockiert` + `reviewer:mensch`
- Sonst: `status:geplant` oder `status:eingang`

---

## 📊 Im Dashboard sehen

**Nach Import:**

1. Öffne Dashboard: `http://localhost:8001`
2. Wechsle zu **Kanban-Ansicht**
3. Du siehst:

```
📥 Eingang          📅 Geplant           🚧 Blockiert
┌──────────────┐   ┌──────────────┐    ┌──────────────┐
│ SHP-003      │   │ SHP-001      │    │ SHP-013      │
│ SHP-006      │   │ SHP-004      │    │ SHP-015      │
│ SHP-007      │   │ SHP-012      │    │ SHP-023      │
│ SHP-010      │   │ ...          │    │ SHP-025      │
│ SHP-011      │   │              │    │ SHP-026      │
└──────────────┘   └──────────────┘    └──────────────┘
```

---

## ✅ Metriken

Nach vollständigem Import siehst du:

```
Offene Aufgaben: 27
Kritisch (P0): 5 (HIGH Risk)
In Arbeit: 0
Review: 0
Blockiert: 5 (HIGH Risk - warten auf Ahmet)
Diese Woche erledigt: 0
```

---

## 🎯 Nächste Schritte

### 1. Alle Issues im Dashboard verwalten

```
Codex/Claude sehen → Status-Update im Issue
↓
Label auf GitHub ändern → Dashboard aktualisiert sich nach 2 Min
↓
Agenten sehen Änderung im Dashboard
↓
Workflow ist synchron
```

### 2. Fortschritt tracken

**Im Dashboard möglich:**
- Kanban: Welche sind fertig? (status:fertig Spalte)
- Metriken: Wie viele sind blockiert?
- Filter: Nur "HIGH Risk" zeigen
- Suche: Nach Task-ID suchen (z.B. "SHP-013")

### 3. Human Gates tracken

HIGH Risk Tasks sind `status:blockiert` bis Ahmet Freigabe gibt:

```
SHP-009  45-Minuten-Sicherheitstest (Codex+Claude)
SHP-013  Teppichboden-Menü (Codex)
SHP-015  Live-Collection (Codex)
SHP-023  Google-Kanal (Ahmet+Worker)
SHP-025  OPC-/Softiq-Daten (Codex)
SHP-026  Live Release (Ahmet+Codex)
```

Ahmet sieht diese sofort im Dashboard und kann:
- Kommentar schreiben → Agent bekommt Notification
- Label ändern: `status:blockiert` → `status:geplant` (wenn Freigabe)

### 4. Abhängigkeiten managen

SHP-013 hängt ab von SHP-012.

**Im Issue-Body dokumentiert:**
```
## Abhängigkeiten
SHP-012 (vor diesem starten!)

## Nächster Schritt
ChatGPT prüft Menü-Struktur → Issue SHP-012
```

Dashboard zeigt Abhängigkeiten nicht visuell, aber:
- Agent liest Comment
- Agent sieht abhängiges Issue im Kanban
- Agent wartet bis abhängiges Issue `status:fertig`

---

## 🔄 Workflow-Beispiel

### Szenario: SHP-010 (Windows-SEO)

1. **Claude sieht Issue im Dashboard**
   - Status: `eingang`
   - Priority: `p2`
   - Worker: Codex

2. **Claude liest Details**
   - Ziel: `npm run seo:check Exit 0; 0 ERRORs`
   - Abhängigkeiten: SHP-001 (muss zuerst fertig sein)

3. **Claude wartet auf SHP-001**
   - Prüft Dashboard ob SHP-001 `status:fertig`
   - Nein? → Blockiert
   - Kommentar: "Warte auf SHP-001"
   - Schließt Issue als blockiert

4. **SHP-001 wird fertig**
   - Codex: `status:fertig`
   - Dashboard zeigt SHP-001 in "Fertig" Spalte

5. **Claude sieht Update**
   - "SHP-001 ist fertig!"
   - Ändert SHP-010 auf `status:geplant`
   - Codex oder Claude: `status:in-arbeit`
   - Implementiert das Fix

6. **Claude ist fertig**
   - Status: `review`
   - Codex reviewer Notification
   - Codex prüft in GitHub/PR

7. **Codex gibt Freigabe**
   - `status:fertig`
   - Issue geschlossen

---

## 🚨 HIGH Risk Tasks verwalten

Diese brauchen **Ahmet's Freigabe** bevor sie in `status:in-arbeit` gehen:

```
SHP-013, SHP-015, SHP-023, SHP-025, SHP-026
```

**Aktuell:** `status:blockiert` mit `reviewer:mensch`

**Wenn Ahmet freigeben will:**
1. Ahmet schreibt Comment im Issue:
   ```
   Freigabe erteilt.
   Menüressourcen unter /resources/menu/target.json verfügbar.
   ```

2. Ahmet ändert Label:
   - `status:blockiert` → `status:geplant`

3. Dashboard zeigt Issue in "Geplant" Spalte

4. Codex sieht Änderung → Starts arbeiten

---

## 📈 Erfolgs-Metriken

Am Ende können wir sehen:

```
Roadmap Progress:
├─ Fertig: X/27 (XX%)
├─ In Arbeit: X/27
├─ Blockiert: X/27
├─ Geplant: X/27
└─ Eingang: X/27

HIGH Risk Abschlüsse:
├─ SHP-009: ✓
├─ SHP-013: ✓ oder ✗
├─ SHP-015: ✓ oder ✗
├─ SHP-023: ✓ oder ✗
├─ SHP-025: ✓ oder ✗
└─ SHP-026: ✓ oder ✗
```

---

## 🔧 Automatisches Sync (Zukünftig)

Später könnten wir ein GitHub Action Script haben, das:
1. ROADMAP.md parst
2. Neue Issues automatisch erstellt
3. Status-Updates synced (wenn GitHub Issue Status ändert)
4. Weekly Reports generiert

Für jetzt: **Manuelles Management über Dashboard + GitHub Issues**.

---

**Du schaffst das! 🚀**

Fragen? Siehe [AI_WORKFLOW.md](./AI_WORKFLOW.md) und [LABELS_SYSTEM.md](./LABELS_SYSTEM.md)
