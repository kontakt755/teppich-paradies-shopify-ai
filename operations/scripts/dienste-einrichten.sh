#!/usr/bin/env bash
# Richtet die beiden Dauer-Dienste des Control Centers auf diesem Mac ein:
#
#   1. Dashboard-Dienst (net.teppich-paradies.dashboard) - Plist liegt schon
#      unter ~/Library/LaunchAgents, dieses Skript laedt ihn nur (falls noetig).
#   2. Sync-Dienst (net.teppich-paradies.sync) - Vorlage unter
#      operations/launchagents/net.teppich-paradies.sync.plist.vorlage;
#      dieses Skript fuellt die Platzhalter (__HOME__, __REPO_PFAD__,
#      __NODE_PFAD__) und installiert das Ergebnis.
#
#   bash operations/scripts/dienste-einrichten.sh
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

ZUGANG_VORHANDEN=0
ZUGANG_GRUND=""
if [[ -f "${ENV_DATEI}" ]]; then
  if grep -qE '^\s*SHOPIFY_ADMIN_TOKEN\s*=\s*shpat_' "${ENV_DATEI}"; then
    ZUGANG_VORHANDEN=1
    ZUGANG_GRUND="SHOPIFY_ADMIN_TOKEN (shpat_) in .env.local"
  elif grep -qE '^\s*SHOPIFY_ADMIN_TOKEN\s*=\s*atkn_' "${ENV_DATEI}"; then
    ZUGANG_GRUND="SHOPIFY_ADMIN_TOKEN in .env.local beginnt mit atkn_ - das ist ein Automatisierungstoken OHNE Admin-GraphQL-Zugriff, zaehlt nicht als Zugang."
  elif grep -qE '^\s*SHOPIFY_CLIENT_ID\s*=\s*\S+' "${ENV_DATEI}" && grep -qE '^\s*SHOPIFY_CLIENT_SECRET\s*=\s*\S+' "${ENV_DATEI}"; then
    ZUGANG_VORHANDEN=1
    ZUGANG_GRUND="SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET in .env.local"
  fi
fi

if [[ "${ZUGANG_VORHANDEN}" -eq 0 ]]; then
  fehlt "Kein Shopify-Zugang gefunden (.env.local: SHOPIFY_ADMIN_TOKEN oder SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET)."
  [[ -n "${ZUGANG_GRUND}" ]] && hinweis "${ZUGANG_GRUND}"
  hinweis ""
  hinweis "Der Sync-Dienst wird deshalb NICHT installiert - ohne Zugang wuerde er"
  hinweis "alle 60 Sekunden neu starten und immer dieselbe Fehlermeldung loggen."
  hinweis ""
  hinweis "So richtest du den Zugang ein:"
  hinweis "  1. domains/shopify/admin-token-oauth.md lesen (shpat_-Token, Scopes)."
  hinweis "  2. Token in ${ENV_DATEI} eintragen: SHOPIFY_ADMIN_TOKEN=shpat_..."
  hinweis "  3. Pruefen: npm run operations:verbindung"
  hinweis "  4. Dieses Skript erneut ausfuehren: bash operations/scripts/dienste-einrichten.sh"
else
  ok "Zugang gefunden (${ZUGANG_GRUND})."
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
echo
