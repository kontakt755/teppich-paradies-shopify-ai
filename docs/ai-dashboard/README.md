# 🛍️ Online-Shop Dashboard

Zentrales Echtzeit-Dashboard für die Verwaltung aller Aufgaben des Teppich Paradies Shopify Stores.

**Live anschauen:** https://tobiaski737-coder.github.io/teppich-paradies-shopify-ai/docs/ai-dashboard/

## Was ist das Dashboard?

Das Dashboard ist deine zentrale Kommandozentrale für:

- ✅ Alle offenen Aufgaben des Shops
- 🐛 Bugs und Fehler (priorisiert)
- ✨ Geplante Features
- 💡 Ideen und Brainstorming
- 🔄 Live-Status aller Aufgaben
- 👥 Wer arbeitet gerade woran?
- 📊 Übersicht: Was ist blockiert? Was läuft? Was ist fertig?

**Single Source of Truth:** Alle Daten kommen aus GitHub Issues.

## Wie es funktioniert

```
GitHub Issues (Datenquelle)
          ↓
   GitHub API
          ↓
Dashboard (Live-Anzeige)
          ↓
Claude / Codex / Mensch (Nutzer)
```

### Automatische Updates

Das Dashboard lädt alle **2 Minuten** neue Daten aus GitHub. Du brauchst nicht manuell zu aktualisieren.

Falls sich nichts ändert:
1. Prüfe, ob du mit dem Internet verbunden bist
2. Klicke "Aktualisieren" Button
3. Prüfe GitHub API Status

### Labels sind das System

Jedes Issue braucht Labels:

- `status:*` → Position im Workflow
- `type:*` → Art der Aufgabe
- `priority:*` → Dringlichkeit
- Optional: `area:*` und `reviewer:*`

**Mehr Info:** Siehe [LABELS_SYSTEM.md](../LABELS_SYSTEM.md)

## Dashboard Ansichten

### 1️⃣ Metriken (oben)

Schneller Überblick:

| Metrik | Was | Warum |
|--------|-----|-------|
| Offene Aufgaben | Summe aller nicht-fertig | Wie viel Arbeit? |
| Kritisch (P0) | Priority P0 Issues | Dringend? |
| In Arbeit | Status: in-arbeit | Wer macht gerade was? |
| Review | Status: review | Wer prüft gerade? |
| Blockiert | Status: blockiert | Was wartet? |
| Diese Woche erledigt | Geschlossene in 7 Tagen | Wie viel Fortschritt? |

### 2️⃣ Nächste Schritte

Die 5 wichtigsten Aufgaben, die **jetzt sofort** bearbeitet werden sollten.

Zeigt:
- Titel der Aufgabe
- Aktueller Status
- **Der nächste konkrete Schritt**
- Link zur vollständigen Issue

**Beispiel:**
```
Produktgalerie Fix
Status: Korrektur
→ Claude behebt Performance-Bug aus Codex Review
[GitHub Issue ↗]
```

### 3️⃣ Kanban Board

Klassische Kanban-Ansicht mit 7 Spalten:

```
📥        📅       ⚙️        👀       🔨        🚧       ✅
Eingang  Geplant  In Arbeit  Review  Korrektur Blockiert Fertig
  3        5        2         1        0         1        15
```

Jede Karte zeigt:
- Titel
- Typ (Farb-kodiert)
- Priorität
- Bearbeiter/Zugewiesen an

**Clickable:** Klick auf Karte → Öffnet GitHub Issue

### 4️⃣ Listen-Ansicht

Tabelle mit allen Aufgaben, filterbar nach:

- Status (alle Statuses)
- Priorität (P0-P3)
- Typ (Bug/Feature/Idee)
- Suche nach Titel

**Ideal für:** Schnelle Suche, Übersicht, Vergleich

## Wie man das Dashboard nutzt

### Morgens: Übersicht

1. Dashboard öffnen
2. Metriken anschauen: Wie viel ist blockiert?
3. "Nächste Schritte" lesen: Was ist jetzt zu tun?
4. Kanban anschauen: Wo ist Handlungsbedarf?

### Für Aufgaben anlegen

1. Gehe zu GitHub Issues
2. Klick "New Issue"
3. Wähle Template (Bug/Feature/Idee)
4. Ausfüllen
5. Labels setzen (ist oft schon im Template vorgesetzt)
6. Erstellen

Nach 2 Minuten erscheint die Aufgabe im Dashboard.

### Während Bearbeitung

Agenten (Claude, Codex) nutzen GitHub-Comments um Status zu updateten:

```
Claude:
Implementierung gestartet.
PR: #123
Codex, wenn bereit: Review bitte
```

Das Dashboard zeigt den Status **sofort** (nach Refresh).

### Bei Blockade

Issue als `status:blockiert` markieren und erklären:

```
Claude:
Blockiert: Warte auf Shopify API Key von Ahmet.
Ahmet, bitte Admin Access geben.
```

**Blockierte Issues** sind sichtbar als eigene Spalte. Mensch/Ahmet sieht sofort, worauf gewartet wird.

### Nach Fertig

Codex/Claude setzen Label `status:fertig` und schließen Issue.

Issue verschwindet aus aktiven Spalten, erscheint in "Fertig" Spalte.

## Datenquellen

Das Dashboard liest aus:

### GitHub Issues

Alle offenen und geschlossenen Issues mit relevanten Labels.

**Keine Token nötig!** Dashboard nutzt öffentliche GitHub API.

**Rate Limit:** 60 Anfragen/Stunde pro IP (für anon users).
Bei 2 Min Refresh = 30 Anfragen/Stunde → Sicher im Limit.

### Labels

Labels **definieren** die Anzeige:

- Ohne `status:*` Label → "Eingang"
- Mit `status:review` Label → "Review" Spalte
- Mit `priority:p0` Label → Rotes Badge

**Keine Labels = Nicht sichtbar** im Dashboard (als Standard).

Alternative: Issues ohne Labels erscheinen in "Eingang".

## Technische Details

### Architektur

```
index.html
├── CSS (eingebettet)
├── JavaScript (eingebettet)
│   ├── GitHub API Fetcher
│   ├── Label Parser
│   ├── Status Updater
│   └── Renderer
└── HTML Template
```

**Alles in einer Datei:** Keine externe Dependencies, kein Build-Prozess.

### Sicherheit

- ✅ Keine GitHub Token hartcodiert
- ✅ Nur öffentliche API-Calls (read-only)
- ✅ Keine Secrets werden übertragen
- ✅ HTTPS nur

### Browser-Kompatibilität

- ✅ Chrome/Chromium (neueste)
- ✅ Firefox (neueste)
- ✅ Safari (neueste)
- ✅ Mobile Browser (iOS Safari, Chrome Mobile)

## Lokale Entwicklung

Möchtest du das Dashboard lokal testen?

```bash
cd docs/ai-dashboard/
# Python 3
python -m http.server 8000

# Oder Node.js
npx http-server

# Dann öffne: http://localhost:8000
```

## Fehlerbehandlung

### "GitHub-Daten konnten nicht geladen werden"

**Ursachen:**
- ❌ Internet ist weg
- ❌ GitHub ist down
- ❌ GitHub API Rate Limit erreicht
- ❌ Repository ist privat (in settings)

**Lösung:**
1. Prüfe Internet
2. Prüfe GitHub Status: status.github.com
3. Warte 5-10 Min (Rate Limit)
4. Klick "Erneut versuchen"

### "Repository nicht gefunden"

**Ursache:** Repo ist gelöscht oder Naming ist falsch.

**Lösung:** Prüfe Repo-URL in Dashboard-Code (index.html)

### Dashboard ist leer

**Ursachen:**
- ❌ Keine Issues mit Labels
- ❌ Alle Issues ohne Status-Label
- ❌ Issues sind Private/Draft

**Lösung:** Erstelle Test-Issues mit Labels (siehe unten)

## Test-Issues erstellen

Um das Dashboard zu testen, brauchen wir ein paar Issues:

```bash
# Bug
gh issue create \
  --title "Test: Produktgalerie responsive" \
  --body "Test Issue für Dashboard Demo" \
  --label "type:bug,status:eingang,priority:p1,area:produktseite"

# Feature
gh issue create \
  --title "Test: Live Chat Feature" \
  --body "Test Feature für Dashboard" \
  --label "type:verbesserung,status:geplant,priority:p2"

# Idee
gh issue create \
  --title "Test: KI-Chatbot Idee" \
  --body "Test Idee für Dashboard" \
  --label "type:idee,status:eingang,priority:p3"

# In Progress
gh issue create \
  --title "Test: Performance-Optimierung" \
  --body "In Arbeit..." \
  --label "type:technik,status:in-arbeit,priority:p1"

# Review
gh issue create \
  --title "Test: SEO-Titles" \
  --body "Im Review..." \
  --label "type:seo,status:review,priority:p2,reviewer:codex"

# Blockiert
gh issue create \
  --title "Test: API Integration" \
  --body "Blockiert - warte auf Key" \
  --label "type:technik,status:blockiert,priority:p0"
```

Danach Dashboard refreshen → Issues sollten sichtbar sein!

## Workflow-Integration

Das Dashboard ist **nicht** isoliert - es ist **zentral**:

```
Mensch schreibt Issue
        ↓
Claude sieht es im Dashboard
        ↓
Claude implementiert & updatet Issue-Status
        ↓
Codex sieht Status-Update → Review
        ↓
Codex schreibt Findings
        ↓
Claude sieht Findings → Behebt sie
        ↓
Alle sehen Fortschritt im Dashboard
```

Mehr Info: [AI_WORKFLOW.md](../AI_WORKFLOW.md)

## Links & Referenzen

- 🏷️ **Label-System:** [LABELS_SYSTEM.md](../LABELS_SYSTEM.md)
- 🤖 **AI-Workflow:** [AI_WORKFLOW.md](../AI_WORKFLOW.md)
- 📝 **Issue Templates:** [.github/ISSUE_TEMPLATE/](./.github/ISSUE_TEMPLATE/)
- 🛒 **Shop Repo:** [GitHub](https://github.com/tobiaski737-coder/teppich-paradies-shopify-ai)

## Häufige Fragen

### "Kann ich Issues direkt vom Dashboard aus bearbeiten?"

Nein, derzeit nicht. Aber:
- Klick auf Issue → Öffnet GitHub
- Dort: Label/Status/Assignee ändern
- Dashboard aktualisiert sich nach 2 Min

Zukünftig: Direkt im Dashboard editieren (mit GitHub Auth).

### "Warum aktualisiert sich das Dashboard nicht?"

Möglichkeiten:
- GitHub API Rate Limit erreicht
- GitHub ist down
- Repo ist jetzt privat
- Browser-Cache: Strg+F5 (Force Refresh)

### "Kann ich offline arbeiten?"

Nein, das Dashboard braucht GitHub API.

Offline-Mode könnte in Zukunft implementiert werden (lokale Copy).

### "Wie kann ich das Dashboard anpassen?"

Bearbeite `index.html`:
- Farben ändern (CSS Variablen)
- Neue Status-Spalten hinzufügen
- Neue Metriken
- Neue Views (z.B. Timeline, Burndown)

### "Wird mein GitHub-Token gespeichert?"

**Nein!** Es wird **kein Token verwendet**. Das Dashboard nutzt:
- Public GitHub API (kostenlos, anonym)
- Read-Only Operationen
- Keine Authentifizierung

Dein Dashboard bleibt privat/sicher.

## Troubleshooting für Entwickler

Siehe Browser-Console (F12) für Fehler:

```js
// In Console:
console.log(allIssues); // Alle geladenen Issues
console.log(filteredIssues); // Gefilterte Issues
refreshDashboard(); // Manueller Refresh
```

---

**Viel Erfolg damit! 🚀**

Bei Fragen → Siehe [AI_WORKFLOW.md](../AI_WORKFLOW.md) oder GitHub Issues
