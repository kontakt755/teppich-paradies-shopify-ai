#!/usr/bin/env bash
# Oeffnet das gemeinsame Dashboard in einem eigenen Chrome-/Edge-App-Fenster.
# Standard ist der Dienst auf diesem Mac. Ein anderer Arbeitsplatz verwendet
# TP_DASHBOARD_APP_URL=https://<privater-dashboard-name>/, nie eine HTTP-Netz-IP.
set -euo pipefail
umask 077

APP_PORT="${PORT:-8001}"
PRIVAT_ORDNER="${TP_PRIVAT_DIR:-${HOME}/teppich-paradies-analyse}"
mkdir -p "${PRIVAT_ORDNER}"
PROTOKOLL="${PRIVAT_ORDNER}/dashboard-start.log"
# Fehler bleiben fuer einen aufrufenden App-Starter sichtbar und stehen im Log.
exec 3>&2
exec >>"${PROTOKOLL}" 2>&1
printf '\n=== %s Dashboard-App oeffnen ===\n' "$(date '+%Y-%m-%d %H:%M:%S')"

fehler() {
  printf 'Fehler: %s\n' "$1" >&2
  printf 'Teppich Dashboard: %s\nProtokoll: %s\n' "$1" "${PROTOKOLL}" >&3
  exit 1
}

pruefe_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] || return 1
  (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

[[ "$(uname -s)" == 'Darwin' ]] || fehler 'Dieser App-Starter ist fuer macOS vorgesehen.'
pruefe_port "${APP_PORT}" || fehler 'PORT muss eine ganze Zahl zwischen 1 und 65535 sein.'
APP_PORT="$((10#${APP_PORT}))"
ADRESSE="${TP_DASHBOARD_APP_URL:-http://localhost:${APP_PORT}}"
[[ ! "${ADRESSE}" =~ [[:space:][:cntrl:]] && "${ADRESSE}" != *\\* ]] \
  || fehler 'Die Dashboard-Adresse darf keine Leerzeichen, Steuerzeichen oder Rueckstriche enthalten.'
case "${ADRESSE}" in
  https://*) SCHEMA='https'; REST="${ADRESSE#https://}" ;;
  http://*) SCHEMA='http'; REST="${ADRESSE#http://}" ;;
  *) fehler 'TP_DASHBOARD_APP_URL muss mit https:// oder einer lokalen http://-Adresse beginnen.' ;;
esac
ADRESSKOPF="${REST%%[/?#]*}"
[[ "${ADRESSKOPF}" =~ ^(\[[0-9A-Fa-f:]+\]|[A-Za-z0-9][A-Za-z0-9.-]*)(:([0-9]{1,5}))?$ ]] \
  || fehler 'Die Dashboard-Adresse enthaelt keinen gueltigen Servernamen oder unerlaubte Zugangsdaten.'
ZIELRECHNER="${BASH_REMATCH[1]}"
ZIELPORT="${BASH_REMATCH[3]:-}"
if [[ -n "${ZIELPORT}" ]]; then
  pruefe_port "${ZIELPORT}" || fehler 'Der Port in der Dashboard-Adresse muss zwischen 1 und 65535 liegen.'
  ZIELPORT="$((10#${ZIELPORT}))"
elif [[ "${SCHEMA}" == 'http' ]]; then ZIELPORT=80
else ZIELPORT=443
fi

LOOPBACK=0
case "${ZIELRECHNER}" in localhost|127.0.0.1|'[::1]') LOOPBACK=1 ;; esac
[[ "${SCHEMA}" == 'https' || "${LOOPBACK}" == 1 ]] \
  || fehler 'Druckerzugriff braucht HTTPS. Eine HTTP-Adresse ist nur fuer localhost, 127.0.0.1 oder [::1] erlaubt.'
LOKALER_DIENST=0
if [[ "${SCHEMA}" == 'http' && "${LOOPBACK}" == 1 && "${ZIELPORT}" == "${APP_PORT}" ]]; then LOKALER_DIENST=1; fi

BROWSER=''
# Chrome bevorzugen, auch wenn es im Benutzerordner installiert ist. Erst dann
# Edge versuchen; Safari und der Standardbrowser unterstuetzen den Druck nicht.
for KANDIDAT in '/Applications/Google Chrome.app' "${HOME}/Applications/Google Chrome.app" \
  '/Applications/Microsoft Edge.app' "${HOME}/Applications/Microsoft Edge.app"; do
  if test -d "${KANDIDAT}"; then BROWSER="${KANDIDAT}"; break; fi
done
[[ -n "${BROWSER}" ]] || fehler 'Google Chrome oder Microsoft Edge fehlt. Bitte einen dieser Browser auf diesem Mac installieren.'
command -v open >/dev/null || fehler 'Der macOS-App-Aufruf open fehlt.'
command -v curl >/dev/null || fehler 'Die Verbindungspruefung curl fehlt.'

bereit() { curl --fail --silent --output /dev/null --connect-timeout 1 --max-time 1 --url "${ADRESSE}"; }
STARTFRIST=$((SECONDS + 20))
if ! bereit; then
  if [[ "${LOKALER_DIENST}" != 1 ]]; then
    fehler 'Das angegebene Dashboard ist nicht erreichbar. Adresse und private Netzwerkverbindung pruefen; es wurde kein lokaler Dienst gestartet.'
  fi
  command -v launchctl >/dev/null || fehler 'Der lokale Dashboard-Dienst kann ohne launchctl nicht gestartet werden.'
  printf 'Lokaler Dienst antwortet nicht; wecke den Dashboard-Dienst.\n'
  if ! launchctl kickstart -k "gui/$(id -u)/net.teppich-paradies.dashboard"; then
    launchctl load "${HOME}/Library/LaunchAgents/net.teppich-paradies.dashboard.plist" \
      || fehler 'Der lokale Dashboard-Dienst konnte nicht gestartet werden. Einrichtung des Dienstes pruefen.'
  fi
  BEREIT=0
  # Die Frist umfasst auch die HTTP-Pruefungen. Zusaetzlich bleibt die Zahl
  # sofortiger Fehlversuche begrenzt.
  for ((VERSUCH=0; VERSUCH<40 && SECONDS<STARTFRIST; VERSUCH++)); do
    if bereit; then BEREIT=1; break; fi
    (( SECONDS < STARTFRIST )) || break
    sleep 0.5
  done
  [[ "${BEREIT}" == 1 ]] || fehler 'Der lokale Dashboard-Dienst ist nach 20 Sekunden noch nicht erreichbar. Bitte den Dienst und sein Protokoll pruefen.'
fi

# Nur die Herkunft protokollieren: Pfad/Abfrage koennen private Angaben enthalten.
printf 'Oeffne Dashboard als eigenes App-Fenster (%s://%s).\n' "${SCHEMA}" "${ADRESSKOPF}"
open -n -a "${BROWSER}" --args "--app=${ADRESSE}" \
  || fehler 'Das Dashboard-App-Fenster konnte nicht geoeffnet werden. Bitte Chrome oder Edge pruefen.'
