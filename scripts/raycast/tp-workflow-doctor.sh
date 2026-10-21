#!/usr/bin/env bash
# @raycast.schemaVersion 1
# @raycast.title Workflow-Doctor
# @raycast.mode fullOutput
# @raycast.packageName TeppichParadies
# @raycast.icon 🩺
# @raycast.description Alle Deploy-Blocker auf einmal, im Deploy-Worktree auf main
source "$(dirname "$0")/_umgebung.sh"
# Deploys laufen im eigenen Worktree auf main (AGENTS.md), nicht im Hauptcheckout.
DEPLOY_DIR="${TP_DEPLOY_DIR:-${HOME}/Developer/tp-deploy}"
[[ -d "${DEPLOY_DIR}" ]] || { echo "Deploy-Worktree fehlt: ${DEPLOY_DIR} (TP_DEPLOY_DIR setzen)"; exit 1; }
cd "${DEPLOY_DIR}" && npm run -s workflow:doctor
