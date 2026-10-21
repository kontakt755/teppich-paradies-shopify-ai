#!/usr/bin/env bash
# @raycast.schemaVersion 1
# @raycast.title Deploy frei?
# @raycast.mode compact
# @raycast.packageName TeppichParadies
# @raycast.icon 🚦
# @raycast.description Vor jedem Merge nach main: laeuft gerade ein Deploy?
source "$(dirname "$0")/_umgebung.sh"
npm run -s deploy:frei
