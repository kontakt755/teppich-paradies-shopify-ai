# 👋 Willkommen! Claude API Setup (15 Min)

**Für**: Neuer Kollege ab Dienstag  
**Zeit**: ~15 Minuten  
**Danach**: Du kannst Claude nutzen wie die anderen auch

---

## ⏱️ Quick Setup (3 Schritte)

### Schritt 1: API Key aus 1Password (2 Min)

```bash
# 1. 1Password öffnen (falls nicht installiert: https://1password.com)
# 2. Nach "Claude API Key" suchen
# 3. Key KOPIEREN (sieht aus wie: sk-ant-xxxxxxxxxxxxx)
# 4. Merken oder anpinnen
```

### Schritt 2: Auf DEINEM Gerät Laden (5 Min)

**Wenn du einen Mac hast:**
```bash
# 1. Terminal öffnen (Cmd + Space → "Terminal")
# 2. Folgendes eingeben (ersetze xxx mit deinem Key):

export ANTHROPIC_API_KEY='sk-ant-xxxxxxxxxxxxx'

# 3. Enter drücken
# Fertig!
```

**Wenn du Windows hast:**
```powershell
# 1. PowerShell öffnen (nicht Command Prompt!)
# 2. Folgendes eingeben (ersetze xxx mit deinem Key):

$env:ANTHROPIC_API_KEY = "sk-ant-xxxxxxxxxxxxx"

# 3. Enter drücken
# Fertig!
```

### Schritt 3: Testen (1 Min)

```bash
# Terminal/PowerShell eingeben:

python router_api_migration.py --demo

# Sollte zeigen:
# ✅ Beispiel-Queries
# ✅ Kostenrechnung
# ✅ Demo läuft erfolgreich
```

**Wenn das funktioniert: ✅ DU BIST READY!**

---

## 🎯 Was du jetzt kannst

```bash
# Shopify Theme analysieren:
python router_api_migration.py --query "Analyze the product card component"

# Kosten checken:
python api_cost_monitor.py

# Cache Performance testen:
python router_api_migration.py --test-cache
```

---

## ❓ Häufige Fragen

### F: Wo genau ist der API Key in 1Password?

**A:** 
```
1Password öffnen
→ "Claude API Key" suchen
→ Key anklicken
→ "Copy" klicken
```

### F: Was ist dieses `python router_api_migration.py --demo`?

**A:** Das ist das Analyse-Tool. Es:
- Analysiert Shopify Theme Code
- Berechnet Kosten
- Nutzt automatisch Caching (billiger)

Du brauchst nur den Command zu kennen, nicht WIE es funktioniert.

### F: Muss ich den API Key jedes Mal neu laden?

**A:** Einmal pro Terminal-Session. Nach dem Neustart Terminal: 
```bash
export ANTHROPIC_API_KEY='...'  # (oder Windows equivalent)
```

Dann funktioniert's wieder.

### F: Was ist mit meinen anderen Computern?

**A:** Gleich wie bei dir:
```bash
# Jedes Gerät (Mac/Windows):
export ANTHROPIC_API_KEY='...'
# Dann funktioniert's
```

---

## 🆘 Wenn es nicht funktioniert

### Problem: "command not found: python"

**Lösung:**
```bash
# Versuche:
python3 router_api_migration.py --demo

# Oder Kollege fragen (er weiß es)
```

### Problem: "ANTHROPIC_API_KEY not found"

**Lösung:**
```bash
# Hast du den Key wirklich geladen?
echo $ANTHROPIC_API_KEY

# Wenn leer: 
export ANTHROPIC_API_KEY='sk-ant-...'
# (mit DEINEM echten Key, aus 1Password)
```

### Problem: Demo zeigt einen Fehler

**Lösung:**
```bash
# Frag deinen Kollegen - wahrscheinlich Quick Fix
# Oder: Repo aktualisieren
git pull origin main
```

---

## 📞 SOS - Bei Fragen

```
Dein Kollege sitzt im Büro/Kasse/zuhause
→ Frag einfach!

(Das ist kein großes Setup - 15 Min und du bist ready)
```

---

## ✅ Checklist: Du bist ready wenn:

- [ ] 1Password öffnen & API Key finden funktioniert
- [ ] Terminal/PowerShell: `export ANTHROPIC_API_KEY='...'` läuft
- [ ] `python router_api_migration.py --demo` zeigt Demo ohne Fehler
- [ ] Du verstehst: "Dieser Key lädt Claude AI für meine Analysen"

---

## 🎓 Wenn du mehr wissen willst

Dann später lesen (nicht jetzt!):

- `CLAUDE_API_INTEGRATION.md` - Für fortgeschrittene Nutzer
- `MIGRATION_ACTION_PLAN.md` - Warum wir das machen
- `api_cost_analysis_report.md` - Finanzielle Details

Aber für JETZT: Die 15 Min oben. Das reicht.

---

**Status**: 🟢 **READY TO START**

Du brauchst nur 15 Minuten und dann funktioniert alles.

Viel Erfolg! 🚀

---

*Onboarding-Guide für neue Kollegen*  
*Teppich Paradies Shopify Project*
