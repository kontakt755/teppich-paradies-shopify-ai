# 🔒 Sichere Multi-Device Setup für Claude API

**Für**: Mac (zuhause), Mac (Arbeit), Windows (Kasse), Windows (Büro 1), Windows (Büro 2), Handy  
**Sicherheit**: API Key in Password Manager (nie hart-coded)  
**Status**: Produktionsreif

---

## 🎯 Setup-Überblick

```
1Password / KeePass / Bitwarden
    ↓
API Key sicher gespeichert
    ↓
Jedes Gerät: `export ANTHROPIC_API_KEY='...'`
    ↓
Router nutzt API automatisch
```

---

## ✅ Schritt 1: API Key Sicher Speichern

### Beim ersten Setup (einmalig)

```bash
# 1. API Key besorgen
# → https://console.anthropic.com/account/keys
# Kopiere: sk-ant-xxxxxxxxxxxx

# 2. In 1Password / KeePass / Bitwarden speichern
# Titel: "Claude API Key - Teppich Paradies"
# Notizen: 
#   - Für: router_api_migration.py
#   - Gültig für: Claude API Requests
#   - Erstellt: [Datum]
```

**Welcher Password Manager?**

| Manager | Für wen | Kosten | Sync |
|---------|--------|--------|------|
| **1Password** (empfohlen) | Einzel + Teams | €3.99/Monat | Über iCloud/Cloud |
| **Bitwarden** (kostenlos) | Einzel + Teams | Kostenlos | Cloud |
| **KeePass** | Lokal | Kostenlos | Manuell |
| **macOS Keychain** | Nur Mac | Kostenlos | iCloud |
| **Windows Credential Manager** | Nur Windows | Kostenlos | Lokal |

**Empfehlung**: **1Password** (works everywhere, Teams option)

---

## 🖥️ Setup pro Gerät

### Mac (zuhause) & Mac (Arbeit)

**Wenn 1Password/Bitwarden installiert:**

```bash
# Terminal öffnen (~/.zshrc oder ~/.bash_profile bearbeiten)
nano ~/.zshrc

# Hinzufügen:
export ANTHROPIC_API_KEY='sk-ant-xxxxxxxxxxxx'

# Speichern: Ctrl+X, Y, Enter

# Laden:
source ~/.zshrc

# Testen:
echo $ANTHROPIC_API_KEY
# Output: sk-ant-xxxxxxxxxxxx ✅
```

**Alternative: Automatisch aus 1Password laden**

```bash
# Nur wenn 1Password CLI installiert:
# https://developer.1password.com/docs/cli/get-started/

# In ~/.zshrc:
export ANTHROPIC_API_KEY=$(op read "op://Personal/Claude API Key/credential")

# Nach op login:
op signin
```

---

### Windows (Kasse, Büro 1, Büro 2)

**Via PowerShell (Admin):**

```powershell
# 1. PowerShell öffnen (Admin)

# 2. Profile erstellen (falls nicht vorhanden)
if (!(Test-Path $profile)) { New-Item -Path $profile -ItemType File -Force }

# 3. Bearbeiten
notepad $profile

# 4. Hinzufügen:
$env:ANTHROPIC_API_KEY = "sk-ant-xxxxxxxxxxxx"

# 5. Speichern & PowerShell neustarten

# 6. Testen:
echo $env:ANTHROPIC_API_KEY
# Output: sk-ant-xxxxxxxxxxxx ✅
```

**Alternativ: System-Umgebungsvariable (bleibt persistent)**

```powershell
# PowerShell (Admin):
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-ant-xxxxxxxxxxxx", "User")

# Danach Terminal/PowerShell neustarten
```

---

### iPhone/Android (Handy)

**Option 1: SSH vom Handy auf Mac/Windows**

```bash
# Handy Terminal (z.B. iSH auf iPhone):
ssh user@mac-arbeit

# Dann:
export ANTHROPIC_API_KEY='...'
python router_api_migration.py --demo
```

**Option 2: Remote Notebook (VSCode Remote SSH)**

```bash
# VSCode auf Handy
# → Remote SSH Extension
# → Connect to Mac/Windows
# → Alle Tools verfügbar
```

---

## 🔐 Best Practices für Multi-Device

### 1️⃣ **Niemals hart-codieren**
```bash
# ❌ FALSCH:
# router_api_migration.py:
api_key = "sk-ant-xxxxxxxxxxxx"  # NIEMALS!

# ✅ RICHTIG:
# In Environment Variable laden
import os
api_key = os.getenv("ANTHROPIC_API_KEY")
```

### 2️⃣ **Für Sharing mit Kollegen**
```bash
# ✅ SICHER: Kollege bekommt API Key in 1Password Team
# → Nur der Key wird geteilt, nicht der Code

# ❌ UNSICHER: Key in Slack/Email/Docs
```

### 3️⃣ **Wechsel zwischen Standorten**

**Szenario: Von Kasse (Windows) zu Büro (Mac)**

```bash
# Windows Terminal (Kasse):
# - API Key in 1Password/KeePass gespeichert
# - `echo $env:ANTHROPIC_API_KEY` zeigt es

# → Zu Mac (Büro) gehen

# Mac Terminal (Büro):
# - API Key in 1Password/Keychain gespeichert
# - `echo $ANTHROPIC_API_KEY` zeigt es
# - Alles funktioniert gleich!
```

### 4️⃣ **Key Rotation (Sicherheit)**

```bash
# Jeden 3 Monate neu generieren:
# 1. https://console.anthropic.com/account/keys
# 2. Neuen Key generieren
# 3. Alten Key löschen
# 4. In 1Password aktualisieren
# 5. Auf allen Geräten: Neu laden & testen
```

---

## ✅ Validierung auf allen Geräten

```bash
# Auf JEDEM Gerät nach Setup testen:

# 1. API Key geladen?
echo $ANTHROPIC_API_KEY
# → Sollte "sk-ant-xxxxxxxxxxxx" zeigen

# 2. Pre-Flight Check durchführen
./api_cost_check.sh

# 3. Demo durchführen
python router_api_migration.py --demo

# Alle ✅? → Device ist ready!
```

---

## 🆕 Für Neuen Kollegen ab Dienstag

**Einfaches 15-Minuten Onboarding:**

### Mittwoch (Dein Onboarding Tag):

```bash
# 1. Du zeigst ihm:
#    - Wo der API Key in 1Password ist
#    - Wie er ihn auf SEIN Gerät lädt

# 2. Er macht es selbst:
export ANTHROPIC_API_KEY='sk-ant-...'  # oder Windows equivalent

# 3. Ihr testet zusammen:
./api_cost_check.sh
python router_api_migration.py --demo

# 4. Fertig! ✅
```

**Was er nicht wissen muss (vorerst):**
- Wie der Router funktioniert (intern)
- API Pricing Details (ist konfiguriert)
- Migration Strategy (ist geklärt)

**Was er nur wissen muss:**
- Wo API Key (1Password)
- Wie laden (`echo $ANTHROPIC_API_KEY`)
- Demo durchführen (`python router_api_migration.py --demo`)

---

## 🚨 Troubleshooting

### Problem: "ANTHROPIC_API_KEY not found"

**Auf Mac:**
```bash
# 1. Check Profil
cat ~/.zshrc | grep ANTHROPIC

# 2. Neu laden
source ~/.zshrc

# 3. Testen
echo $ANTHROPIC_API_KEY  # Sollte Key zeigen

# 4. Wenn leer: 1Password öffnen, Key kopieren, neu eingeben
```

**Auf Windows:**
```powershell
# 1. Check PowerShell Profile
notepad $profile

# 2. Neu starten (wichtig!)
# Schließe & öffne PowerShell

# 3. Testen
echo $env:ANTHROPIC_API_KEY

# 4. Wenn leer: Umgebungsvariable manuell setzen
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-ant-...", "User")
```

### Problem: "Key funktioniert auf Mac, aber nicht auf Windows"

```bash
# Wahrscheinlich: Unterschiedliche Keys in Password Manager
# Lösung: 1Password öffnen, nachschauen welche da steht

# Oder: Copy/Paste Fehler (Leerzeichen)?
# Test mit: 
echo $env:ANTHROPIC_API_KEY | wc -c
# Sollte ~130 Zeichen sein (nicht mehr/weniger)
```

---

## 📋 Checkliste: Multi-Device Setup

- [ ] 1Password / KeePass / Bitwarden installiert
- [ ] API Key in Password Manager gespeichert
- [ ] Mac (zuhause): ANTHROPIC_API_KEY in ~/.zshrc
- [ ] Mac (Arbeit): ANTHROPIC_API_KEY in ~/.zshrc
- [ ] Windows (Kasse): ANTHROPIC_API_KEY in PowerShell Profile
- [ ] Windows (Büro 1): ANTHROPIC_API_KEY in PowerShell Profile
- [ ] Windows (Büro 2): ANTHROPIC_API_KEY in PowerShell Profile
- [ ] Jedes Gerät: `./api_cost_check.sh` erfolgreich
- [ ] Jedes Gerät: `python router_api_migration.py --demo` erfolgreich
- [ ] Neuer Kollege (Dienstag): Onboarding durchgeführt
- [ ] Neuer Kollege: API Key geladen & getestet

---

## 📞 Schnelle Referenz

| Gerät | API Key Laden | Test Befehl |
|-------|---------------|-------------|
| **Mac** | `export ANTHROPIC_API_KEY='...'` | `echo $ANTHROPIC_API_KEY` |
| **Windows** | PowerShell Profile / Umgebungsvariable | `echo $env:ANTHROPIC_API_KEY` |
| **Handy** | SSH remote oder VSCode Remote | Über Mac/Windows verbinden |

---

**Status**: 🟢 **MULTI-DEVICE READY**

Alle Geräte können gleichzeitig den Router nutzen, ohne Code zu teilen.
API Key ist sicher in Password Manager gespeichert.

---

*Erstellt: 28.08.2026*  
*Für: Multi-Device Setup (Mac + Windows + Handy)*
