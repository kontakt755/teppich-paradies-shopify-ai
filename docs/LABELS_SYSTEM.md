# 🏷️ Label-Systematik für AI-Orchestrierung

Dieses Dokument definiert alle GitHub Labels für das Dashboard und die Zusammenarbeit zwischen Agenten.

## Status Labels (`status:*`)

Der Status definiert, wo sich eine Aufgabe im Workflow befindet.

| Label | Emoji | Bedeutung |
|-------|-------|-----------|
| `status:eingang` | 📥 | Neue Aufgabe, noch nicht geplant |
| `status:geplant` | 📅 | Aufgabe ist geplant und bereit zum Start |
| `status:in-arbeit` | ⚙️ | Claude oder Mitarbeiter arbeitet dran |
| `status:review` | 👀 | Codex oder Mensch prüft die Lösung |
| `status:korrektur` | 🔨 | Findings aus Review müssen behoben werden |
| `status:blockiert` | 🚧 | Aufgabe ist blockiert, wartet auf etwas |
| `status:fertig` | ✅ | Erledigt und deployed |

## Typ Labels (`type:*`)

Der Typ definiert, um was für eine Aufgabe es sich handelt.

| Label | Emoji | Bedeutung |
|-------|-------|-----------|
| `type:bug` | 🐛 | Fehler, der behoben werden muss |
| `type:verbesserung` | ✨ | Feature oder Verbesserung |
| `type:idee` | 🧠 | Brainstorming, noch nicht spezifiziert |
| `type:ux` | 🎨 | UX/Design-Verbesserung |
| `type:seo` | 📈 | SEO-Optimierung |
| `type:content` | 📝 | Content-Änderung oder Text |
| `type:technik` | ⚙️ | Technische Infrastruktur oder Refactoring |

## Priorität Labels (`priority:*`)

Nur eine Priorität pro Issue!

| Label | Farbe | Bedeutung |
|-------|-------|-----------|
| `priority:p0` | 🔴 Rot | Kritisch - stoppt den Shop oder ist ein Sicherheitsrisiko |
| `priority:p1` | 🟠 Orange | Hoch - wichtig, sollte bald gemacht werden |
| `priority:p2` | 🟡 Gelb | Normal - Standard Priority |
| `priority:p3` | 🟢 Grün | Niedrig - kann später gemacht werden |

## Bereich Labels (`area:*`)

Optional, definiert, welcher Bereich des Shops betroffen ist.

| Label | Bedeutung |
|-------|-----------|
| `area:produktseite` | Einzelne Produktseite |
| `area:kategorie` | Kategorieseite |
| `area:navigation` | Hauptnavigation, Menüs |
| `area:filter` | Produktfilter |
| `area:warenkorb` | Warenkorb-Funktion |
| `area:checkout` | Checkout-Prozess |
| `area:seo` | SEO Meta-Tags, Structured Data |
| `area:google` | Google Shopping, Ads, etc. |
| `area:versand` | Versandoptionen, -kosten |
| `area:design` | Design/CSS/Layout |
| `area:backend` | Backend, APIs, Datenbank |
| `area:sonstiges` | Andere Bereiche |

## Reviewer Labels (`reviewer:*`)

Wer reviewt/prüft diese Aufgabe?

| Label | Bedeutung |
|-------|-----------|
| `reviewer:codex` | Codex prüft Code-Qualität |
| `reviewer:claude` | Claude prüft Logik/Funktionalität |
| `reviewer:mensch` | Mensch (Ahmet/Mitarbeiter) muss prüfen |
| `reviewer:auto` | Automatische Tests/CI |

## Wie man Labels nutzt

### Neue Issue erstellen:

1. **Immer** einen `status:*` Label hinzufügen (normalerweise `status:eingang`)
2. **Immer** einen `type:*` Label hinzufügen
3. **Immer** einen `priority:*` Label hinzufügen
4. Optional: `area:*` für bessere Kategorisierung
5. Optional: `reviewer:*` wenn schon klar ist, wer prüft

### Issue im Workflow aktualisieren:

Status-Label wechseln, wenn die Aufgabe den Status ändert:

```
status:eingang → status:geplant → status:in-arbeit → status:review
                                                          ↓
                                             status:fertig (wenn OK)
                                                    oder
                                             status:korrektur (wenn Fehler)
                                                          ↓
                                             status:review (erneut)
```

### Beispiel Issue-Labels:

**Neue Produktgalerie Bug:**
- `status:eingang`
- `type:bug`
- `priority:p1`
- `area:produktseite`

**SEO Title Optimierung:**
- `status:geplant`
- `type:seo`
- `priority:p2`
- `area:seo`
- `reviewer:claude`

**Live-Chat Idee:**
- `status:eingang`
- `type:idee`
- `priority:p3`
- `area:sonstiges`

## Label-Farben Empfehlung

Im GitHub Repo unter Settings → Labels → Farben setzen:

- `status:*` → Blau (#0075ca)
- `type:*` → Grün (#28a745)
- `priority:p0` → Rot (#dc3545)
- `priority:p1` → Orange (#fd7e14)
- `priority:p2` → Gelb (#ffc107)
- `priority:p3` → Grau (#6f42c1)
- `area:*` → Cyan (#17a2b8)
- `reviewer:*` → Violett (#6f42c1)

## Labels erstellen

Laufe folgenden Script aus, um alle Labels zu erstellen:

```bash
gh label create "status:eingang" --color 0075ca --description "📥 Neue Aufgabe"
gh label create "status:geplant" --color 0075ca --description "📅 Geplant"
gh label create "status:in-arbeit" --color 0075ca --description "⚙️ In Arbeit"
gh label create "status:review" --color 0075ca --description "👀 Review"
gh label create "status:korrektur" --color 0075ca --description "🔨 Korrektur"
gh label create "status:blockiert" --color 0075ca --description "🚧 Blockiert"
gh label create "status:fertig" --color 0075ca --description "✅ Fertig"

gh label create "type:bug" --color 28a745 --description "🐛 Bug"
gh label create "type:verbesserung" --color 28a745 --description "✨ Feature"
gh label create "type:idee" --color 28a745 --description "🧠 Idee"
gh label create "type:ux" --color 28a745 --description "🎨 UX"
gh label create "type:seo" --color 28a745 --description "📈 SEO"
gh label create "type:content" --color 28a745 --description "📝 Content"
gh label create "type:technik" --color 28a745 --description "⚙️ Technik"

gh label create "priority:p0" --color dc3545 --description "🔴 P0 Kritisch"
gh label create "priority:p1" --color fd7e14 --description "🟠 P1 Hoch"
gh label create "priority:p2" --color ffc107 --description "🟡 P2 Normal"
gh label create "priority:p3" --color 6f42c1 --description "🟢 P3 Niedrig"

gh label create "area:produktseite" --color 17a2b8 --description "Produktseite"
gh label create "area:kategorie" --color 17a2b8 --description "Kategorie"
gh label create "area:navigation" --color 17a2b8 --description "Navigation"
gh label create "area:filter" --color 17a2b8 --description "Filter"
gh label create "area:warenkorb" --color 17a2b8 --description "Warenkorb"
gh label create "area:checkout" --color 17a2b8 --description "Checkout"
gh label create "area:seo" --color 17a2b8 --description "SEO"
gh label create "area:google" --color 17a2b8 --description "Google"
gh label create "area:versand" --color 17a2b8 --description "Versand"
gh label create "area:design" --color 17a2b8 --description "Design"
gh label create "area:backend" --color 17a2b8 --description "Backend"
gh label create "area:sonstiges" --color 17a2b8 --description "Sonstiges"

gh label create "reviewer:codex" --color 6f42c1 --description "Codex prüft"
gh label create "reviewer:claude" --color 6f42c1 --description "Claude prüft"
gh label create "reviewer:mensch" --color 6f42c1 --description "Mensch prüft"
```

Führe dies im Repo-Verzeichnis aus:

```bash
bash /path/to/setup-labels.sh
```

Oder erstelle Labels manuell in GitHub unter Settings → Labels.
