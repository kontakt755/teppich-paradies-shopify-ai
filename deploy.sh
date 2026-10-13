#!/bin/bash
# Stillgelegt am 2026-10-12.
# Dieses Skript stammte aus der Galerie-Umstellung (Anfang September) und pushte
# am Deploy-Ablauf vorbei: Es nahm das erste unveroeffentlichte Theme (das konnte
# das Fallback- oder Arbeitstheme sein) und pushte direkt ins Live-Theme.
# Deploys laufen ausschliesslich ueber die Kette in AGENTS.md ("Deploy").
echo "deploy.sh ist stillgelegt. Deploy nur ueber die Kette:" >&2
echo "  npm run workflow:doctor  ->  workflow:preview  ->  workflow:live" >&2
echo "Details: AGENTS.md (Abschnitt Deploy), docs/WORKFLOW.md, Skill deploy." >&2
exit 1
