#!/usr/bin/env bash
# Richtet die drei Dienste des Social-Media-Moduls auf diesem Mac ein:
#
#   net.teppich-paradies.social        Zentrale (8020) und Monteur-Upload (8021), dauerhaft
#   net.teppich-paradies.social-takt   alle 15 Minuten: Uploads pruefen, Faelliges veroeffentlichen
#   net.teppich-paradies.social-lauf   taeglich 06:40: Shop abgleichen, planen, Kennzahlen
#
#   bash social/scripts/dienste-einrichten.sh            # einrichten bzw. neu laden
#   bash social/scripts/dienste-einrichten.sh entfernen  # alle drei wieder abmelden
#
# Die Dienste laufen aus der Arbeitskopie, in der dieses Skript liegt. Wird sie
# verschoben, das Skript dort erneut ausfuehren.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ZIEL="${HOME}/Library/LaunchAgents"
PRIVAT="${TP_PRIVAT_DIR:-${HOME}/teppich-paradies-analyse}"
DIENSTE=(net.teppich-paradies.social net.teppich-paradies.social-takt net.teppich-paradies.social-lauf)

schritt() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
ok()      { printf '   \033[32m%s\033[0m\n' "$1"; }
hinweis() { printf '   %s\n' "$1"; }

if [[ "$(uname)" != "Darwin" ]]; then echo "launchd-Dienste gibt es nur auf macOS." >&2; exit 1; fi

if [[ "${1:-}" == "entfernen" ]]; then
  for d in "${DIENSTE[@]}"; do
    launchctl bootout "gui/$(id -u)/${d}" >/dev/null 2>&1 || true
    rm -f "${ZIEL}/${d}.plist"
    ok "entfernt: ${d}"
  done
  exit 0
fi

command -v node >/dev/null || { echo "Node fehlt." >&2; exit 1; }
NODE_PFAD="$(command -v node)"
mkdir -p "${ZIEL}" "${PRIVAT}/social"

# Die Zentrale im Netz verlangt eine Anmeldung - ohne Zugaenge wuerde der Dienst
# den Start verweigern und launchd ihn endlos neu starten.
if [[ ! -f "${PRIVAT}/benutzer.json" && ! -f "${PRIVAT}/dashboard-passwort.txt" && -z "${TP_DASHBOARD_PASSWORT:-}" ]]; then
  echo "Abbruch: weder benutzer.json noch dashboard-passwort.txt unter ${PRIVAT} - erst Zugaenge anlegen (npm run benutzer -- anlegen)." >&2
  exit 1
fi

# Derselbe Tailscale-Name wie beim Control Center, falls dort eingetragen.
EXTRA_HOSTS=""
DASHBOARD_PLIST="${ZIEL}/net.teppich-paradies.dashboard.plist"
if [[ -f "${DASHBOARD_PLIST}" ]]; then
  EXTRA_HOSTS="$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:TP_DASHBOARD_EXTRA_HOSTS' "${DASHBOARD_PLIST}" 2>/dev/null || true)"
fi

for d in "${DIENSTE[@]}"; do
  schritt "${d}"
  sed -e "s#__HOME__#${HOME}#g" -e "s#__REPO_PFAD__#${REPO}#g" -e "s#__NODE_PFAD__#${NODE_PFAD}#g" -e "s#__EXTRA_HOSTS__#${EXTRA_HOSTS}#g" \
    "${REPO}/social/launchagents/${d}.plist.vorlage" > "${ZIEL}/${d}.plist"
  # bootout + bootstrap statt kickstart: nur so liest launchd eine geaenderte Plist neu ein.
  launchctl bootout "gui/$(id -u)/${d}" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "${ZIEL}/${d}.plist"
  ok "geladen aus ${REPO}"
done

schritt "Fertig"
hinweis "Zentrale:       http://$(scutil --get LocalHostName 2>/dev/null || hostname).local:8020${EXTRA_HOSTS:+  bzw.  http://${EXTRA_HOSTS%%,*}:8020}"
hinweis "Monteur-Upload: Port 8021, Links anlegen mit: npm run social -- zugang anlegen \"Name\""
hinweis "Protokolle:     ${PRIVAT}/social/dienst.log, takt.log, lauf.log"
