#!/usr/bin/env bash
# @raycast.schemaVersion 1
# @raycast.title Control Center oeffnen
# @raycast.mode silent
# @raycast.packageName TeppichParadies
# @raycast.icon 🧭
# @raycast.description Oeffnet das Dashboard im eigenen App-Fenster (scripts/dashboard-app-starten.sh)
source "$(dirname "$0")/_umgebung.sh"
bash scripts/dashboard-app-starten.sh && echo "Control Center geoeffnet"
