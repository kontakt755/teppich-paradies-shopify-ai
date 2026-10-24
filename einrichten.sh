#!/bin/bash
# Richtet die beiden letzten Dinge ein, die nur der Inhaber selbst tun kann:
#   1. Shopify-Zugangsschluessel  -> Daten alle 10 Minuten statt zweimal taeglich
#   2. Oeffentliche GitHub-Seite  -> abschalten, damit nichts mehr im Netz steht
#
# Doppelklick auf "Dashboard einrichten.command" auf dem Schreibtisch,
# oder im Terminal:  bash ~/tp-dashboard/einrichten.sh
set -uo pipefail

REPO="${HOME}/tp-dashboard"
ENV_DATEI="${REPO}/.env.local"
SHOP="sjjyq1-6w"
PLIST_ZIEL="${HOME}/Library/LaunchAgents/net.teppich-paradies.sync.plist"

blau()  { printf '\033[1;34m%s\033[0m\n' "$1"; }
gruen() { printf '\033[1;32m%s\033[0m\n' "$1"; }
rot()   { printf '\033[1;31m%s\033[0m\n' "$1"; }
frage() { printf '\033[1m%s\033[0m ' "$1"; }

echo
blau "═══════════════════════════════════════════════════════════"
blau "  Teppich Paradies · Dashboard einrichten"
blau "═══════════════════════════════════════════════════════════"
echo

# ─────────────────────────────────────────────────────────────
# 1. Shopify-Zugangsschluessel
# ─────────────────────────────────────────────────────────────
blau "1. Shopify-Zugangsschluessel"
echo

if grep -q '^SHOPIFY_ADMIN_TOKEN=shpat_' "${ENV_DATEI}" 2>/dev/null; then
  gruen "   Schon hinterlegt - Schritt uebersprungen."
else
  cat <<'ANLEITUNG'
   Ohne Schluessel holt das Dashboard die Daten nur zweimal taeglich.
   Mit Schluessel: alle 10 Minuten, und der Knopf "Jetzt aktualisieren" wirkt.

   So bekommst du ihn (etwa 3 Minuten):
     1. Es oeffnet sich gleich die Seite "Apps entwickeln" im Shopify-Admin.
     2. "App erstellen" -> Name: TP Dashboard -> anlegen
     3. Reiter "Konfiguration" -> Admin-API-Integration -> "Bearbeiten"
        Haken setzen bei:  read_orders   read_products   read_customers
        -> Speichern
     4. Reiter "API-Zugangsdaten" -> "App installieren"
     5. "Admin-API-Zugriffstoken anzeigen" -> kopieren (beginnt mit shpat_)
     6. Hierher zurueck und einfuegen.

ANLEITUNG
  frage "   Jetzt die Shopify-Seite oeffnen? [J/n]"
  read -r antwort
  if [[ ! "${antwort}" =~ ^[nN] ]]; then
    open "https://admin.shopify.com/store/${SHOP}/settings/apps/development"
  fi
  echo
  frage "   Token einfuegen (bleibt unsichtbar), oder Enter zum Ueberspringen:"
  read -rs token
  echo
  echo

  if [ -z "${token}" ]; then
    rot "   Uebersprungen - das Dashboard laeuft weiter mit zweimal taeglich."
  elif [[ ! "${token}" =~ ^shpat_ ]]; then
    rot "   Das sieht nicht nach einem Admin-Token aus (muss mit shpat_ beginnen)."
    rot "   Nichts gespeichert. Skript einfach nochmal starten."
  else
    # Erst pruefen, dann speichern - ein falscher Token faellt sofort auf.
    antwort_api="$(curl -s -X POST "https://${SHOP}.myshopify.com/admin/api/2025-01/graphql.json" \
      -H "X-Shopify-Access-Token: ${token}" -H "Content-Type: application/json" \
      -d '{"query":"{ shop { name } orders(first:1){nodes{name}} }"}' 2>/dev/null)"
    if echo "${antwort_api}" | grep -q '"shop"' && ! echo "${antwort_api}" | grep -q '"errors"'; then
      touch "${ENV_DATEI}"; chmod 600 "${ENV_DATEI}"
      # vorhandene Zeile ersetzen statt doppelt anhaengen
      if grep -q '^SHOPIFY_ADMIN_TOKEN=' "${ENV_DATEI}"; then
        tmp="$(mktemp)"; grep -v '^SHOPIFY_ADMIN_TOKEN=' "${ENV_DATEI}" > "${tmp}"; mv "${tmp}" "${ENV_DATEI}"
        chmod 600 "${ENV_DATEI}"
      fi
      printf 'SHOPIFY_ADMIN_TOKEN=%s\n' "${token}" >> "${ENV_DATEI}"
      gruen "   Geprueft und gespeichert (nur lokal, Datei nur fuer dich lesbar)."

      # Sync-Dienst einrichten: ab jetzt alle 10 Minuten
      if [ -f "${REPO}/operations/scripts/dienste-einrichten.sh" ]; then
        bash "${REPO}/operations/scripts/dienste-einrichten.sh" 2>&1 | sed 's/^/   /'
      fi
      if [ -f "${PLIST_ZIEL}" ]; then
        launchctl kickstart -k "gui/$(id -u)/net.teppich-paradies.sync" 2>/dev/null \
          || launchctl load "${PLIST_ZIEL}" 2>/dev/null
        gruen "   Abgleich laeuft ab jetzt alle 10 Minuten."
      fi
    else
      rot "   Der Token wurde von Shopify abgelehnt - nichts gespeichert."
      echo "   Antwort: $(echo "${antwort_api}" | head -c 200)"
      echo "   Haeufigster Grund: Schritt 4 (App installieren) fehlt, oder"
      echo "   die Rechte read_orders/read_products wurden nicht gespeichert."
    fi
  fi
fi

echo
# ─────────────────────────────────────────────────────────────
# 2. Oeffentliche Seite abschalten
# ─────────────────────────────────────────────────────────────
blau "2. Oeffentliche GitHub-Seite abschalten"
echo

status="$(curl -s -o /dev/null -w '%{http_code}' \
  https://kontakt755.github.io/teppich-paradies-shopify-ai/ai-dashboard/issues.json 2>/dev/null)"

if [ "${status}" = "404" ]; then
  gruen "   Schon abgeschaltet - nichts zu tun."
else
  cat <<'ANLEITUNG'
   Die Aufgabenliste ist noch im Netz abrufbar (jeder mit dem Link).
   Abschalten geht nur mit dem Konto kontakt755:

     1. Es oeffnet sich gleich die Seite "Pages" der Einstellungen.
     2. Unter "Build and deployment" bei "Source" auf  None  stellen.
     3. Speichern - fertig.

ANLEITUNG
  frage "   Jetzt die GitHub-Seite oeffnen? [J/n]"
  read -r antwort2
  if [[ ! "${antwort2}" =~ ^[nN] ]]; then
    open "https://github.com/kontakt755/teppich-paradies-shopify-ai/settings/pages"
  fi
  echo
  echo "   (Erscheint 'Page not found': dann ist der Browser mit dem falschen"
  echo "    Konto angemeldet - oben rechts auf kontakt755 wechseln.)"
fi

echo
blau "═══════════════════════════════════════════════════════════"
echo "   Dashboard oeffnen:  Klick auf 'Teppich Dashboard' im Dock"
echo "   Adresse im Netz:    http://$(ipconfig getifaddr en0 2>/dev/null || echo 192.168.2.222):8001"
echo "   Passwort:           ~/teppich-paradies-analyse/dashboard-passwort.txt"
blau "═══════════════════════════════════════════════════════════"
echo
frage "   Enter zum Schliessen"
read -r _
