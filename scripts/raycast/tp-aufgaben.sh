#!/usr/bin/env bash
# @raycast.schemaVersion 1
# @raycast.title Meine Aufgaben
# @raycast.mode fullOutput
# @raycast.packageName TeppichParadies
# @raycast.icon ✅
# @raycast.description Offene Aufgaben aus dem Control Center (npm run task -- list --mine)
source "$(dirname "$0")/_umgebung.sh"
npm run -s task -- list --mine
