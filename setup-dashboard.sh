#!/bin/bash

# Online-Shop Dashboard Setup Script
# Erstellt alle notwendigen Labels für das Dashboard-System

echo "🚀 Online-Shop Dashboard Setup"
echo "================================"
echo ""

# Prüfe ob gh CLI installiert ist
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) nicht installiert"
    echo "Installation: https://cli.github.com"
    exit 1
fi

echo "✅ GitHub CLI gefunden"
echo ""

# Status Labels
echo "📝 Erstelle Status-Labels..."
gh label create "status:eingang" --color 0075ca --description "📥 Neue Aufgabe" --force 2>/dev/null
gh label create "status:geplant" --color 0075ca --description "📅 Geplant" --force 2>/dev/null
gh label create "status:in-arbeit" --color 0075ca --description "⚙️ In Arbeit" --force 2>/dev/null
gh label create "status:review" --color 0075ca --description "👀 Review" --force 2>/dev/null
gh label create "status:korrektur" --color 0075ca --description "🔨 Korrektur" --force 2>/dev/null
gh label create "status:blockiert" --color 0075ca --description "🚧 Blockiert" --force 2>/dev/null
gh label create "status:fertig" --color 28a745 --description "✅ Fertig" --force 2>/dev/null
echo "✅ Status-Labels erstellt"

# Type Labels
echo "📝 Erstelle Type-Labels..."
gh label create "type:bug" --color dc3545 --description "🐛 Bug" --force 2>/dev/null
gh label create "type:verbesserung" --color fd7e14 --description "✨ Feature" --force 2>/dev/null
gh label create "type:idee" --color 6f42c1 --description "🧠 Idee" --force 2>/dev/null
gh label create "type:ux" --color 17a2b8 --description "🎨 UX" --force 2>/dev/null
gh label create "type:seo" --color 20c997 --description "📈 SEO" --force 2>/dev/null
gh label create "type:content" --color ffc107 --description "📝 Content" --force 2>/dev/null
gh label create "type:technik" --color 343a40 --description "⚙️ Technik" --force 2>/dev/null
echo "✅ Type-Labels erstellt"

# Priority Labels
echo "📝 Erstelle Priority-Labels..."
gh label create "priority:p0" --color dc3545 --description "🔴 P0 Kritisch" --force 2>/dev/null
gh label create "priority:p1" --color fd7e14 --description "🟠 P1 Hoch" --force 2>/dev/null
gh label create "priority:p2" --color ffc107 --description "🟡 P2 Normal" --force 2>/dev/null
gh label create "priority:p3" --color 28a745 --description "🟢 P3 Niedrig" --force 2>/dev/null
echo "✅ Priority-Labels erstellt"

# Area Labels
echo "📝 Erstelle Area-Labels..."
for area in produktseite kategorie navigation filter warenkorb checkout seo google versand design backend sonstiges; do
  gh label create "area:$area" --color 17a2b8 --description "🎯 $area" --force 2>/dev/null
done
echo "✅ Area-Labels erstellt"

# Reviewer Labels
echo "📝 Erstelle Reviewer-Labels..."
gh label create "reviewer:codex" --color 6f42c1 --description "🤖 Codex prüft" --force 2>/dev/null
gh label create "reviewer:claude" --color 6f42c1 --description "🤖 Claude prüft" --force 2>/dev/null
gh label create "reviewer:mensch" --color e83e8c --description "👤 Mensch prüft" --force 2>/dev/null
echo "✅ Reviewer-Labels erstellt"

echo ""
echo "✅ Dashboard Setup abgeschlossen!"
echo ""
echo "📊 Dashboard öffnen:"
echo "   https://github.com/kontakt755/teppich-paradies-shopify-ai/issues"
echo ""
echo "📖 Dokumentation:"
echo "   - Label-System: docs/LABELS_SYSTEM.md"
echo "   - AI-Workflow: docs/AI_WORKFLOW.md"
echo "   - Dashboard: docs/ai-dashboard/README.md"
echo ""
