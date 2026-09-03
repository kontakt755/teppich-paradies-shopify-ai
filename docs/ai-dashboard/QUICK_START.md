# 🚀 Dashboard Quick Start

Schnelleinstieg für die Nutzung des Online-Shop Dashboards.

## 1️⃣ Dashboard öffnen

**Live:** https://github.com/tobiaski737-coder/teppich-paradies-shopify-ai/docs/ai-dashboard/

Oder lokal:
```bash
cd docs/ai-dashboard/
python -m http.server 8000
# Öffne: http://localhost:8000
```

## 2️⃣ Erste Aufgabe erstellen

Gehe zu **GitHub Issues** → **New Issue**

Wähle ein Template:
- 🐛 **Bug** - für Fehler
- ✨ **Feature** - für neue Funktionen
- 💡 **Idee** - zum Brainstormen

Ausfüllen und erstellen. **Nach 2 Min** erscheint es im Dashboard!

## 3️⃣ Dashboard Ansicht verstehen

### Oben: Metriken

```
Offene Aufgaben: 12 | Kritisch: 2 | In Arbeit: 3 | Review: 1
```

### Mitte: Nächste Schritte

```
🎯 Was ist jetzt zu tun?

Produktgalerie responsive
Status: Review
→ Codex prüft mobile Darstellung
```

### Unten: Kanban Board oder Liste

Drag & Drop nicht nötig - änder Labels auf GitHub und Dashboard aktualisiert sich.

## 4️⃣ Status aktualisieren

**Im GitHub Issue:**

Ändere das `status:*` Label:
- `status:eingang` → Neue Aufgabe
- `status:geplant` → Ready to start
- `status:in-arbeit` → Wird gerade bearbeitet
- `status:review` → Im Code Review
- `status:korrektur` → Fixes nötig
- `status:blockiert` → Wartet
- `status:fertig` → Erledigt

**Das Dashboard** zeigt den neuen Status sofort!

## 5️⃣ Agenten-Handoff

**Claude schreibt in Issue:**
```
Claude:

Implementierung fertig.
PR: #123

Codex, bitte Review durchführen.
```

**Dann:**
1. Ändere Label: `status:in-arbeit` → `status:review`
2. Dashboard zeigt Issue in "Review" Spalte
3. Codex sieht die Notification
4. Codex prüft PR und schreibt Findings

## 6️⃣ Blockierte Aufgaben

Wenn du blockiert bist:

```
Claude:

Blockiert: Warte auf Shopify API Key.
Ahmet, bitte Access geben.
```

Dann:
1. Label: `status:blockiert`
2. Dashboard zeigt Issue in "Blockiert" Spalte
3. Ahmet sieht sofort was blockiert ist
4. Ahmet gibt Access
5. Du setzt Label zurück auf `status:geplant` oder `status:in-arbeit`

## 7️⃣ Filter nutzen (Listenansicht)

Klick auf "Liste" View:

```
Status: [Alle ▼]   Priorität: [Alle ▼]   Typ: [Alle ▼]
Suche: ________________
```

Beispiele:
- **Filter Status=Review:** Nur Aufgaben im Review
- **Filter Priorität=P0:** Nur kritische Aufgaben
- **Suche "produktgalerie":** Schnelle Suche

## 8️⃣ Metriken verstehen

| Metrik | Bedeutung | Aktion |
|--------|-----------|--------|
| Offene Aufgaben | Gesamt Work | Zu viel? Mehr Agenten? |
| Kritisch (P0) | Urgent Issues | Fix sofort! |
| In Arbeit | Aktuelle Arbeit | Sind alle aktiv? |
| Review | Warten auf Approval | Codex → Approve/Findings |
| Blockiert | Stuck Issues | Unblocken! |
| Diese Woche erledigt | Progress | Positives Feedback! |

## 9️⃣ Best Practices

✅ **DO:**
- Label **immer** setzen
- **Nächster Schritt** klar schreiben
- Status-Label **aktuell halten**
- Comment bei Handoff schreiben
- Test-Issues löschen vor Production

❌ **DONT:**
- Issues ohne Labels
- Alte Status-Labels nicht updaten
- PR erstellen ohne Comment
- Blockade nicht erklären

## 🔟 Troubleshooting

**Q: Dashboard ist leer**
A: Kein Issue mit Status-Label? Erstelle ein Test-Issue mit `status:eingang` Label

**Q: Issue erscheint nicht**
A: Braucht `status:*` Label. Ohne Label → wird standardmäßig nicht angezeigt

**Q: Dashboard updated nicht**
A: Maximal 2 Min Verzögerung. Oder Browser: F5 (Refresh)

**Q: Kann ich Issues editieren?**
A: Ja, auf GitHub. Ändere Labels/Status/Assignee dort. Dashboard sync nach 2 Min.

---

**Das war's!** Du bist ready! 🎉

Mehr Info siehe:
- [README.md](./README.md) - Detaillierte Doku
- [../LABELS_SYSTEM.md](../LABELS_SYSTEM.md) - Alle Labels erklärt
- [../AI_WORKFLOW.md](../AI_WORKFLOW.md) - Agenten-Workflow
