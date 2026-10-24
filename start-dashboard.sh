#!/bin/bash
# Oeffnet das Control Center. Der Server laeuft als Hintergrunddienst
# (~/Library/LaunchAgents/net.teppich-paradies.dashboard.plist) und startet
# beim Anmelden von selbst. Dieses Skript weckt ihn notfalls und oeffnet das Fenster.
set -uo pipefail
PORT="${PORT:-8001}"
PROTOKOLL="${HOME}/teppich-paradies-analyse/dashboard-start.log"
mkdir -p "$(dirname "${PROTOKOLL}")"
exec >>"${PROTOKOLL}" 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M:%S') Oeffnen ==="

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
ADRESSE="http://${IP:-localhost}:${PORT}"

if ! curl -s -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/"; then
  echo "Dienst antwortet nicht - starte ihn neu."
  launchctl kickstart -k "gui/$(id -u)/net.teppich-paradies.dashboard" 2>/dev/null \
    || launchctl load "${HOME}/Library/LaunchAgents/net.teppich-paradies.dashboard.plist" 2>/dev/null
  for _ in $(seq 1 40); do
    sleep 0.5
    curl -s -o /dev/null --max-time 2 "http://127.0.0.1:${PORT}/" && break
  done
fi

echo "Oeffne ${ADRESSE}"
open "${ADRESSE}"
