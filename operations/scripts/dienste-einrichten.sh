#!/usr/bin/env bash
# Richtet die lokalen Dienste des Control Centers auf diesem Mac ein:
#
#   1. Dashboard-Dienst (net.teppich-paradies.dashboard) - Plist liegt schon
#      unter ~/Library/LaunchAgents, dieses Skript laedt ihn nur (falls noetig).
#   2. Sync-Dienst (net.teppich-paradies.sync) - Vorlage unter
#      operations/launchagents/net.teppich-paradies.sync.plist.vorlage;
#      dieses Skript fuellt die Platzhalter (__HOME__, __REPO_PFAD__,
#      __NODE_PFAD__) und installiert das Ergebnis.
#
#   bash operations/scripts/dienste-einrichten.sh
#   bash operations/scripts/dienste-einrichten.sh --nur-sicherung
#   bash operations/scripts/dienste-einrichten.sh --routinen
#
# --routinen legt die drei Routine-Dienste (Fehlermeldungen-Vorpruefung, Postfach,
# Dienst-Aktualisierung; operations/README.md, Abschnitt "Routinen als Mac-Dienst")
# nach ~/Library/LaunchAgents und die Log-Ordner an, LAEDT SIE ABER NICHT: das
# Einschalten (launchctl bootstrap) macht der Inhaber von Hand, die Befehle stehen
# am Ende der Ausgabe.
#
# Die Sicherung ersetzt den bisherigen gleichnamigen Claude-Zeitplan.
# Diesen vor der Installation pausieren, damit nur ein taeglicher Lauf bleibt.
#
# Installiert NICHTS, was ohne Shopify-Zugang nur Fehler produzieren wuerde:
# der Sync-Dienst braucht SHOPIFY_ADMIN_TOKEN oder SHOPIFY_CLIENT_ID/SECRET
# in .env.local (operations/sync/zugang.mjs). Fehlt beides, installiert
# dieses Skript den Sync-Dienst nicht, sondern gibt die Anleitung aus, wie
# der Zugang eingerichtet wird (domains/shopify/admin-token-oauth.md) - kein
# launchd-Dienst, der alle 60 Sekunden mit derselben Fehlermeldung neu startet.
#
# Jeder Schritt ist einzeln wiederholbar und meldet klar, was fehlt.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_DATEI="${REPO}/.env.local"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
DASHBOARD_LABEL="net.teppich-paradies.dashboard"
DASHBOARD_PLIST="${LAUNCH_AGENTS_DIR}/${DASHBOARD_LABEL}.plist"
SYNC_LABEL="net.teppich-paradies.sync"
SYNC_VORLAGE="${REPO}/operations/launchagents/${SYNC_LABEL}.plist.vorlage"
SYNC_PLIST="${LAUNCH_AGENTS_DIR}/${SYNC_LABEL}.plist"
SICHERUNG_LABEL="net.teppich-paradies.sicherung"
SICHERUNG_VORLAGE="${REPO}/operations/launchagents/${SICHERUNG_LABEL}.plist.vorlage"
SICHERUNG_PLIST="${LAUNCH_AGENTS_DIR}/${SICHERUNG_LABEL}.plist"

if [[ "$#" -gt 1 || ( "$#" -eq 1 && "$1" != "--nur-sicherung" && "$1" != "--routinen" ) ]]; then
  printf 'Aufruf: bash operations/scripts/dienste-einrichten.sh [--nur-sicherung | --routinen]\n' >&2
  exit 1
fi

schritt() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
hinweis() { printf '   %s\n' "$1"; }
ok()      { printf '   \033[32m%s\033[0m\n' "$1"; }
fehlt()   { printf '   \033[33m%s\033[0m\n' "$1"; }
fehler()  { printf '\n\033[31mAbbruch: %s\033[0m\n' "$1" >&2; }

if [[ "$(uname)" != "Darwin" ]]; then
  fehler "launchd-Dienste gibt es nur auf macOS. Auf diesem Rechner laeuft nichts davon."
  exit 1
fi

command -v node >/dev/null || { fehler "Node fehlt (wird fuer beide Dienste gebraucht)."; exit 1; }
NODE_PFAD="$(command -v node)"
mkdir -p "${LAUNCH_AGENTS_DIR}"

sicherung_einrichten() {
  schritt "Taegliche Betriebssicherung (${SICHERUNG_LABEL})"
  mkdir -p "${HOME}/Library/Logs"
  local tmp="${SICHERUNG_PLIST}.$$.tmp"
  # XML-Sonderzeichen in lokalen Pfaden sicher maskieren.
  "${NODE_PFAD}" --input-type=module - "${SICHERUNG_VORLAGE}" "${tmp}" "${HOME}" "${REPO}" "${NODE_PFAD}" <<'JS'
import fs from 'node:fs';
const [vorlage, ziel, heim, repo, node] = process.argv.slice(2);
const xml = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
let text = fs.readFileSync(vorlage, 'utf8');
for (const [k, v] of [['__HOME__', heim], ['__REPO_PFAD__', repo], ['__NODE_PFAD__', node]]) text = text.replaceAll(k, xml(v));
fs.writeFileSync(ziel, text, { mode: 0o600 });
JS
  if ! plutil -lint "${tmp}"; then
    rm -f "${tmp}"
    return 1
  fi
  if [[ -f "${SICHERUNG_PLIST}" ]] && cmp -s "${tmp}" "${SICHERUNG_PLIST}" && launchctl list "${SICHERUNG_LABEL}" >/dev/null 2>&1; then
    rm -f "${tmp}"
    ok "Bereits eingerichtet; kein zweiter Dienst gestartet."
    return
  fi
  if launchctl list "${SICHERUNG_LABEL}" >/dev/null 2>&1; then
    launchctl bootout "gui/$(id -u)/${SICHERUNG_LABEL}"
  fi
  mv "${tmp}" "${SICHERUNG_PLIST}"
  launchctl bootstrap "gui/$(id -u)" "${SICHERUNG_PLIST}"
  ok "Taeglich 22:30 Uhr und beim Anmelden; ohne KI-Kontingent."
  hinweis "Log: ${HOME}/Library/Logs/teppich-paradies-sicherung.log"
}

routinen_ablegen() {
  schritt "Routine-Dienste ablegen (nicht laden)"
  local analyse="${HOME}/teppich-paradies-analyse/routinen"
  mkdir -p "${analyse}/fehlermeldungen" "${analyse}/postfach" "${analyse}/dienst-aktualisieren"
  chmod 700 "${analyse}"
  if [[ "${REPO}" != "${HOME}/tp-dashboard" ]]; then
    hinweis "Hinweis: die Dienste laufen aus ~/tp-dashboard, nicht aus ${REPO} - dort muss main nachgezogen sein."
  fi
  local label vorlage ziel tmp
  for label in net.teppich-paradies.fehler-vorpruefung net.teppich-paradies.postfach net.teppich-paradies.dienst-aktualisieren; do
    vorlage="${REPO}/operations/launchagents/${label}.plist.vorlage"
    ziel="${LAUNCH_AGENTS_DIR}/${label}.plist"
    tmp="${ziel}.$$.tmp"
    "${NODE_PFAD}" --input-type=module - "${vorlage}" "${tmp}" "${HOME}" <<'JS'
import fs from 'node:fs';
const [vorlage, ziel, heim] = process.argv.slice(2);
const xml = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
fs.writeFileSync(ziel, fs.readFileSync(vorlage, 'utf8').replaceAll('__HOME__', xml(heim)), { mode: 0o644 });
JS
    if ! plutil -lint "${tmp}" >/dev/null; then
      rm -f "${tmp}"
      fehler "${vorlage} ist keine gueltige Plist."
      return 1
    fi
    if [[ -f "${ziel}" ]] && cmp -s "${tmp}" "${ziel}"; then
      rm -f "${tmp}"
      ok "${label}: unveraendert vorhanden."
    else
      mv "${tmp}" "${ziel}"
      ok "${label}: abgelegt unter ${ziel}."
    fi
    if launchctl print "gui/$(id -u)/${label}" >/dev/null 2>&1; then
      hinweis "  ist bereits geladen - eine geaenderte Datei wirkt erst nach bootout + bootstrap."
    fi
  done
  hinweis ""
  hinweis "Nichts geladen. Einschalten (je Dienst, erst nach dem Trockenlauf):"
  for label in net.teppich-paradies.fehler-vorpruefung net.teppich-paradies.postfach net.teppich-paradies.dienst-aktualisieren; do
    hinweis "  launchctl bootstrap gui/$(id -u) ${LAUNCH_AGENTS_DIR}/${label}.plist"
  done
  hinweis "Abschalten: launchctl bootout gui/$(id -u)/<label>"
}

if [[ "${1:-}" == "--nur-sicherung" ]]; then
  sicherung_einrichten
  exit 0
fi

if [[ "${1:-}" == "--routinen" ]]; then
  routinen_ablegen
  exit 0
fi

# --- 1. Dashboard-Dienst -----------------------------------------------
schritt "1/2  Dashboard-Dienst (${DASHBOARD_LABEL})"
if [[ ! -f "${DASHBOARD_PLIST}" ]]; then
  fehlt "Keine Plist unter ${DASHBOARD_PLIST} gefunden."
  hinweis "Laut Auftrag liegt sie dort bereits vorbereitet - falls nicht, siehe"
  hinweis "docs/control-center/ARCHITEKTUR.md Abschnitt 1c fuer die manuelle Einrichtung."
else
  if launchctl list "${DASHBOARD_LABEL}" >/dev/null 2>&1; then
    ok "Laeuft bereits (launchctl list ${DASHBOARD_LABEL})."
  else
    hinweis "Geladen, aber nicht aktiv - lade neu."
    launchctl unload "${DASHBOARD_PLIST}" >/dev/null 2>&1 || true
    launchctl load "${DASHBOARD_PLIST}"
    ok "Geladen: ${DASHBOARD_PLIST}"
  fi
  hinweis "Log: $(grep -A1 StandardOutPath "${DASHBOARD_PLIST}" | tail -1 | sed -e 's/<string>//' -e 's|</string>||' -e 's/^\s*//')"
fi

# --- 2. Sync-Dienst -------------------------------------------------------
schritt "2/2  Sync-Dienst (${SYNC_LABEL})"

# Dieselbe Pruefung wie der Dienst selbst (operations/sync/zugang.mjs) - kein
# eigenes grep: .env.local darf `KEY=wert` oder `export KEY='wert'` enthalten,
# und Platzhalter zaehlen nicht. Gibt nur ja/nein aus, nie einen Wert.
ZUGANG_VORHANDEN=0
ZUGANG_GRUND=""
ZUGANG_ART="$(cd "${REPO}" && "${NODE_PFAD}" --input-type=module -e '
import { ladeEnvLocal } from "./operations/sync/zugang.mjs";
const e = ladeEnvLocal();
if (/^atkn_/.test(e.SHOPIFY_ADMIN_TOKEN || "") && !(e.SHOPIFY_CLIENT_ID && e.SHOPIFY_CLIENT_SECRET)) console.log("atkn");
else if (e.SHOPIFY_CLIENT_ID && e.SHOPIFY_CLIENT_SECRET) console.log("client");
else if (e.SHOPIFY_ADMIN_TOKEN) console.log("token");
else console.log("keiner");
' 2>/dev/null || echo keiner)"
case "${ZUGANG_ART}" in
  client) ZUGANG_VORHANDEN=1; ZUGANG_GRUND="SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET in .env.local" ;;
  token)  ZUGANG_VORHANDEN=1; ZUGANG_GRUND="SHOPIFY_ADMIN_TOKEN in .env.local" ;;
  atkn)   ZUGANG_GRUND="SHOPIFY_ADMIN_TOKEN in .env.local beginnt mit atkn_ - das ist ein Automatisierungstoken OHNE Admin-GraphQL-Zugriff, zaehlt nicht als Zugang." ;;
esac

if [[ "${ZUGANG_VORHANDEN}" -eq 0 ]]; then
  fehlt "Kein Shopify-Zugang gefunden (.env.local: SHOPIFY_ADMIN_TOKEN oder SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET)."
  [[ -n "${ZUGANG_GRUND}" ]] && hinweis "${ZUGANG_GRUND}"
  hinweis ""
  hinweis "Der Sync-Dienst wird deshalb NICHT installiert - ohne Zugang wuerde er"
  hinweis "alle 60 Sekunden neu starten und immer dieselbe Fehlermeldung loggen."
  hinweis ""
  hinweis "So richtest du den Zugang ein (einmalig, nur der Inhaber):"
  hinweis "  1. Im Dev Dashboard die App oeffnen, Bereiche setzen, im Shop installieren"
  hinweis "     (Schritte: operations/README.md, Abschnitt \"Zugang einrichten\")."
  hinweis "  2. In ${ENV_DATEI} zwei Zeilen eintragen:"
  hinweis "       SHOPIFY_CLIENT_ID=..."
  hinweis "       SHOPIFY_CLIENT_SECRET=..."
  hinweis "  3. Pruefen: npm run operations:verbindung"
  hinweis "  4. Dieses Skript erneut ausfuehren: bash operations/scripts/dienste-einrichten.sh"
else
  ok "Zugang gefunden (${ZUGANG_GRUND})."
  # Erst pruefen, dann installieren: ein Dienst mit falschem Schluessel oder
  # fehlenden Bereichen liefe an, ohne je Daten zu liefern.
  if ! (cd "${REPO}" && "${NODE_PFAD}" operations/scripts/verbindung-pruefen.mjs); then
    fehlt "Die Verbindungspruefung meldet ein Problem (siehe oben). Der Sync-Dienst wird trotzdem eingerichtet -"
    hinweis "lesbare Quellen bleiben frisch, die uebrigen melden im Dashboard, was fehlt."
  fi
  if [[ -f "${SYNC_PLIST}" ]] && launchctl list "${SYNC_LABEL}" >/dev/null 2>&1; then
    ok "Sync-Dienst laeuft bereits (launchctl list ${SYNC_LABEL})."
  else
    hinweis "Erzeuge ${SYNC_PLIST} aus der Vorlage ..."
    sed -e "s#__HOME__#${HOME}#g" \
        -e "s#__REPO_PFAD__#${REPO}#g" \
        -e "s#__NODE_PFAD__#${NODE_PFAD}#g" \
        "${SYNC_VORLAGE}" > "${SYNC_PLIST}"
    launchctl unload "${SYNC_PLIST}" >/dev/null 2>&1 || true
    launchctl load "${SYNC_PLIST}"
    ok "Installiert und geladen: ${SYNC_PLIST}"
    hinweis "Log: ${HOME}/Library/Logs/teppich-paradies-sync.log"
  fi
fi

schritt "Zusammenfassung"
launchctl list | grep -E "${DASHBOARD_LABEL}|${SYNC_LABEL}" || hinweis "Kein Dienst geladen."
hinweis "Sicherung separat uebernehmen: bisherigen Claude-Zeitplan pausieren, dann dieses Skript mit --nur-sicherung ausfuehren."
echo
