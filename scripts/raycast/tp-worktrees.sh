#!/usr/bin/env bash
# @raycast.schemaVersion 1
# @raycast.title Worktrees mit offener Arbeit
# @raycast.mode fullOutput
# @raycast.packageName TeppichParadies
# @raycast.icon 🌳
# @raycast.description Nur Arbeitskopien mit ungesicherter Arbeit (npm run -s kurz -- worktrees)
source "$(dirname "$0")/_umgebung.sh"
npm run -s kurz -- worktrees
