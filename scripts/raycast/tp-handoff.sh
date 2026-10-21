#!/usr/bin/env bash
# @raycast.schemaVersion 1
# @raycast.title Uebergabe kopieren
# @raycast.mode compact
# @raycast.packageName TeppichParadies
# @raycast.icon 📋
# @raycast.argument1 { "type": "text", "placeholder": "Arbeitskopie (leer = Hauptcheckout)", "optional": true }
# @raycast.description Uebergabetext fuer die naechste Sitzung in die Zwischenablage (npm run -s handoff)
source "$(dirname "$0")/_umgebung.sh"
if [[ -n "${1:-}" ]]; then cd "${1/#\~/${HOME}}" || exit 1; fi
npm run -s handoff | pbcopy && echo "Uebergabe kopiert"
