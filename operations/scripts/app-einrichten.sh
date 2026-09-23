#!/usr/bin/env bash
# Richtet die Shopify-App "TP Operations" fertig ein: Zugriffsbereiche setzen,
# Version veroeffentlichen, App installieren, Zugangsdaten hinterlegen, Verbindung pruefen.
#
#   bash operations/scripts/app-einrichten.sh
#
# Das Skript fragt den geheimen Schluessel selbst ab (Eingabe bleibt unsichtbar)
# und schreibt ihn nur nach .env.local (chmod 600). Er wird nie ausgegeben,
# nie geloggt und nie committet.
#
# Jeder Schritt ist einzeln wiederholbar. Bricht einer ab, steht darunter,
# was von Hand zu tun ist.
set -euo pipefail

SHOP_HANDLE="sjjyq1-6w"
SHOP_DOMAIN="${SHOP_HANDLE}.myshopify.com"
APP_NAME="TP Operations"
SCOPES="read_orders,write_orders,read_customers,read_products,write_products,read_fulfillments,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,read_metaobjects,write_metaobjects,read_metaobject_definitions"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_DATEI="${REPO}/.env.local"
APP_DIR="${HOME}/teppich-paradies-analyse/ops/app-konfiguration"
TOML="${APP_DIR}/shopify.app.toml"

schritt() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
hinweis() { printf '   %s\n' "$1"; }
fehler()  { printf '\n\033[31mAbbruch: %s\033[0m\n' "$1" >&2; }

schritt "0/5  Voraussetzungen"
command -v shopify >/dev/null || { fehler "Die Shopify-Kommandozeile fehlt. Installieren: npm i -g @shopify/cli"; exit 1; }
command -v node >/dev/null    || { fehler "Node fehlt."; exit 1; }
hinweis "Shopify CLI $(shopify version 2>/dev/null | tail -1)"
hinweis "Shop        ${SHOP_DOMAIN}"
mkdir -p "${APP_DIR}"

schritt "1/5  App verknuepfen"
if [ -f "${TOML}" ]; then
  hinweis "Bereits verknuepft: ${TOML}"
else
  hinweis "Es oeffnet sich der Browser zur Anmeldung."
  hinweis "In der Auswahl die App \"${APP_NAME}\" waehlen."
  if ! (cd "${APP_DIR}" && shopify app config link); then
    fehler "Verknuepfen fehlgeschlagen. Von Hand: im Dev Dashboard unter App-Einstellungen die Client-ID holen und
         (cd '${APP_DIR}' && shopify app config link --client-id <CLIENT_ID>) ausfuehren."
    exit 1
  fi
fi
[ -f "${TOML}" ] || { fehler "Es wurde keine ${TOML} angelegt."; exit 1; }

schritt "2/5  Zugriffsbereiche eintragen"
node - "$TOML" "$SCOPES" <<'NODE'
const fs = require('fs');
const [datei, scopes] = process.argv.slice(2);
let t = fs.readFileSync(datei, 'utf8');
if (/^\s*\[access_scopes\]/m.test(t)) {
  // Vorhandenen Abschnitt ersetzen, sonstige Schluessel unangetastet lassen.
  t = t.replace(/(^\s*\[access_scopes\][\s\S]*?)(^\s*scopes\s*=\s*".*?"\s*$)/m, `$1scopes = "${scopes}"`);
  if (!t.includes(scopes)) t = t.replace(/^\s*\[access_scopes\]\s*$/m, `[access_scopes]\nscopes = "${scopes}"`);
} else {
  t = t.trimEnd() + `\n\n[access_scopes]\nscopes = "${scopes}"\n`;
}
fs.writeFileSync(datei, t);
console.log('   Bereiche gesetzt in ' + datei);
NODE
grep -A1 '\[access_scopes\]' "${TOML}" | sed 's/^/   /'

schritt "3/5  Version veroeffentlichen"
hinweis "Damit werden die Bereiche fuer die App wirksam."
if ! (cd "${APP_DIR}" && shopify app deploy --force); then
  fehler "Veroeffentlichen fehlgeschlagen. Von Hand im Dev Dashboard: Version erstellen, Feld 'Bereiche' mit der Zeile
         aus ${TOML} fuellen, dann 'Veroeffentlichen'."
  exit 1
fi

CLIENT_ID="$(node -e "const t=require('fs').readFileSync(process.argv[1],'utf8');const m=t.match(/^\s*client_id\s*=\s*\"([^\"]+)\"/m);process.stdout.write(m?m[1]:'')" "${TOML}")"
[ -n "${CLIENT_ID}" ] || { fehler "In ${TOML} steht keine client_id."; exit 1; }

schritt "4/5  App im Shop installieren"
INSTALL_URL="https://admin.shopify.com/store/${SHOP_HANDLE}/oauth/install?client_id=${CLIENT_ID}"
hinweis "Diese Adresse oeffnet sich jetzt. Dort auf 'Installieren' klicken."
hinweis "${INSTALL_URL}"
command -v open >/dev/null && open "${INSTALL_URL}" || true
printf '   Wenn die Installation bestaetigt ist, Eingabetaste druecken. '
read -r _

schritt "5/5  Zugangsdaten hinterlegen und Verbindung pruefen"
hinweis "Den geheimen Schluessel findest du im Dev Dashboard unter App-Einstellungen."
hinweis "Die Eingabe bleibt unsichtbar und wird nur nach .env.local geschrieben."
printf '   Geheimer Schluessel (Client Secret): '
read -rs CLIENT_SECRET
printf '\n'
[ -n "${CLIENT_SECRET}" ] || { fehler "Kein Schluessel eingegeben."; exit 1; }

touch "${ENV_DATEI}"; chmod 600 "${ENV_DATEI}"
# Der Schluessel geht ueber die Umgebung an node, nicht ueber die Befehlszeile -
# Argumente stehen in der Prozessliste, Umgebungsvariablen des Kindprozesses nicht.
TP_CLIENT_SECRET="${CLIENT_SECRET}" node - "$ENV_DATEI" "$CLIENT_ID" <<'NODE'
const fs = require('fs');
const [datei, clientId] = process.argv.slice(2);
const secret = process.env.TP_CLIENT_SECRET;
if (!secret) { console.error('   Kein Schluessel in der Umgebung.'); process.exit(1); }
let t = fs.existsSync(datei) ? fs.readFileSync(datei, 'utf8') : '';
const setze = (schluessel, wert) => {
  const zeile = `export ${schluessel}='${wert}'`;
  const re = new RegExp(`^\\s*(export\\s+)?${schluessel}\\s*=.*$`, 'm');
  t = re.test(t) ? t.replace(re, zeile) : t.trimEnd() + '\n' + zeile + '\n';
};
setze('SHOPIFY_CLIENT_ID', clientId);
setze('SHOPIFY_CLIENT_SECRET', secret);
fs.writeFileSync(datei, t, { mode: 0o600 });
fs.chmodSync(datei, 0o600); // mode aus writeFileSync greift nur bei neuen Dateien
console.log('   Zugangsdaten in .env.local hinterlegt (chmod 600, gitignored).');
NODE
unset CLIENT_SECRET

cd "${REPO}"
hinweis "Token holen ..."
npm run --silent shopify:token -- --grant client-credentials --write-env || {
  fehler "Token-Tausch fehlgeschlagen. Meist heisst das: die App ist noch nicht im Shop installiert (Schritt 4)."
  exit 1
}
hinweis "Verbindung pruefen ..."
npm run --silent operations:verbindung

printf '\n\033[32mFertig.\033[0m Auftragsband mit echten Daten starten:\n'
printf '   npm run operations:band -- --live\n\n'
