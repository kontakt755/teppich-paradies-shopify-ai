#!/usr/bin/env python3
"""
Import Roadmap Tasks to GitHub Issues
Converts SHOPIFY_MASTER_ROADMAP.md tasks to GitHub Issues with proper labels
"""

import subprocess
import json
import sys

# Roadmap-Tasks zum Importieren
TASKS = [
    {
        "id": "SHP-001",
        "title": "Repository-Portabilität",
        "body": """## Ziel
Privates, Windows/Mac-stabiles Git-Fundament spezifizieren und lokal vorbereiten

## Akzeptanzkriterien
- [ ] LF-Regel aktiv
- [ ] Secrets/Artefakte in .gitignore
- [ ] Keine Theme-Inhalte verändert

## Worker
Codex

## Risk
MEDIUM

## Größe
S (Small)""",
        "labels": ["type:technik", "status:geplant", "priority:p1", "area:backend"],
    },
    {
        "id": "SHP-003",
        "title": "QA-Logfilter",
        "body": """## Ziel
QA-Ausgaben auf erste relevante Assertion reduzieren

## Akzeptanzkriterien
- [ ] Rohartefakte lokal verfügbar
- [ ] Worker-Auszug ≤30 relevante Zeilen

## Worker
Codex

## Risk
LOW

## Abhängigkeiten
SHP-001

## Größe
S (Small)""",
        "labels": ["type:technik", "status:eingang", "priority:p2", "area:backend"],
    },
    {
        "id": "SHP-010",
        "title": "Windows-SEO-Tooling angleichen",
        "body": """## Ziel
Originalen Mac-SEO-Checker belegbar wiederherstellen

## Akzeptanzkriterien
- [ ] npm run seo:check Exit 0
- [ ] 0 ERRORs
- [ ] Keine erfundene Gleichwertigkeit

## Worker
Codex

## Risk
MEDIUM

## Größe
M (Medium)""",
        "labels": ["type:technik", "status:eingang", "priority:p2", "area:backend"],
    },
    {
        "id": "SHP-013",
        "title": "Teppichboden-Menü korrigieren",
        "body": """## Ziel
Hauptlink und "Alle Teppichböden" minimal umsetzen

## Akzeptanzkriterien
- [ ] Mobile Zielpfade korrekt
- [ ] Desktop unverändert

## Worker
Codex

## Risk
HIGH ⚠️ (Human Gate erforderlich)

## Abhängigkeiten
SHP-012

## Größe
M (Medium)

## Nächster Schritt
Ahmet: Bitte Menüressourcen genehmigen""",
        "labels": ["type:verbesserung", "status:blockiert", "priority:p1", "area:navigation", "reviewer:mensch"],
    },
    {
        "id": "SHP-012",
        "title": "Teppichboden-Menü-Audit",
        "body": """## Ziel
Live-/Admin-Struktur read-only gegen Zielnavigation prüfen

## Akzeptanzkriterien
- [ ] Globo/Shopify Ownership dokumentiert
- [ ] Links und Lücken belegt

## Worker
ChatGPT Work

## Risk
LOW

## Größe
S (Small)

## Nächster Schritt
ChatGPT: Bitte Menü-Struktur auditieren""",
        "labels": ["type:ux", "status:geplant", "priority:p2", "area:navigation"],
    },
    {
        "id": "SHP-014",
        "title": "Florhöhen-/ecoVella-Evidenzaudit",
        "body": """## Ziel
Sortiment anhand strukturierter Daten klassifizieren

## Akzeptanzkriterien
- [ ] Verteilung dokumentiert
- [ ] Quellen belegt
- [ ] Unklare Fälle markiert

## Worker
ChatGPT Work

## Risk
LOW

## Größe
M (Medium)

## Nächster Schritt
ChatGPT: Bitte Produktdaten auditieren""",
        "labels": ["type:content", "status:geplant", "priority:p2", "area:produktseite"],
    },
    {
        "id": "SHP-015",
        "title": "Live-Collection-Zuordnungen",
        "body": """## Ziel
Freigegebene Hoch-/Mittelflor- und ecoVella-Korrektionen anwenden

## Akzeptanzkriterien
- [ ] Nur belegte, freigegebene Zuordnungen
- [ ] Preise/SKUs unverändert

## Worker
Codex

## Risk
HIGH ⚠️ (Human Gate erforderlich)

## Abhängigkeiten
SHP-014

## Größe
M (Medium)

## Nächster Schritt
Ahmet: Bitte freigegebene Produkt-IDs genehmigen""",
        "labels": ["type:verbesserung", "status:blockiert", "priority:p1", "area:produktseite", "reviewer:mensch"],
    },
    {
        "id": "SHP-023",
        "title": "Google-Kanalausschluss Rollenware",
        "body": """## Ziel
118 Produkte nur aus Google & YouTube entfernen

## Akzeptanzkriterien
- [ ] Online Store aktiv
- [ ] Google & YouTube aus
- [ ] 118 Produkte bestätigt

## Worker
Ahmet + beaufsichtigter Worker

## Risk
HIGH ⚠️ (Human Gate erforderlich)

## Größe
M (Medium)

## Nächster Schritt
Ahmet: Bitte Freigabe erteilen""",
        "labels": ["type:verbesserung", "status:blockiert", "priority:p0", "area:google", "reviewer:mensch"],
    },
]

def run_gh_command(cmd):
    """Führe gh CLI Befehl aus"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"❌ Fehler: {e.stderr}")
        return None

def create_issue(task):
    """Erstelle GitHub Issue aus Task"""
    title = f"[{task['id']}] {task['title']}"
    labels = ",".join(task["labels"])

    cmd = f"""gh issue create \\
        --title "{title}" \\
        --body "{task['body'].replace('"', '\\"')}" \\
        --label "{labels}" """

    print(f"📝 Erstelle: {task['id']}...", end=" ")
    result = run_gh_command(cmd)
    if result:
        print(f"✅")
        return True
    else:
        print(f"❌")
        return False

def main():
    print("🚀 Importiere Roadmap-Tasks...")
    print(f"📊 {len(TASKS)} Tasks zu erstellen\n")

    success = 0
    failed = 0

    for task in TASKS:
        if create_issue(task):
            success += 1
        else:
            failed += 1

    print(f"\n{'='*50}")
    print(f"✅ Erfolg: {success}/{len(TASKS)}")
    if failed > 0:
        print(f"❌ Fehler: {failed}/{len(TASKS)}")
    print(f"{'='*50}")
    print("\n📊 Dashboard aktualisieren: http://localhost:8001")

if __name__ == "__main__":
    main()
