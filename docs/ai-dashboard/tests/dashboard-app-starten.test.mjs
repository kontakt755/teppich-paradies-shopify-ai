import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const STARTER = fileURLToPath(new URL('../../../scripts/dashboard-app-starten.sh', import.meta.url));
const CHROME = '/Applications/Google Chrome.app';
const EDGE = '/Applications/Microsoft Edge.app';
const BENUTZER_CHROME = path.join(os.homedir(), 'Applications/Google Chrome.app');
const BENUTZER_EDGE = path.join(os.homedir(), 'Applications/Microsoft Edge.app');
// Nur Schutz gegen Haenger, keine Zeitmessung: ein Lauf mit 40 Startversuchen braucht sonst
// unter einer Sekunde, auf dem ausgelasteten Mac aber ueber 8 s - am 28.10. hing deshalb das
// Nachziehen des Dashboard-Dienstes an einem roten Probelauf (#1752).
const ZEITLIMIT_MS = 30000;

function umgebung(t, { apps = [CHROME], env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dashboard-app-start-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin'), logs = path.join(dir, 'aufrufe'), privat = path.join(dir, 'privat');
  fs.mkdirSync(bin); fs.mkdirSync(logs);
  const stub = (name, inhalt) => fs.writeFileSync(path.join(bin, name), `#!/bin/bash\nprintf '%s\\0' "$@" >> "$MOCK_LOG_DIR/${name}.args"\nprintf '\\0' >> "$MOCK_LOG_DIR/${name}.args"\n${inhalt}\n`, { mode: 0o700 });
  stub('uname', 'printf "%s\\n" "${MOCK_SYSTEM:-Darwin}"');
  stub('id', 'printf "501\\n"');
  stub('sleep', 'exit 0');
  stub('curl', `stand=0
if [[ -f "$MOCK_LOG_DIR/curl.zaehler" ]]; then read -r stand < "$MOCK_LOG_DIR/curl.zaehler"; fi
stand=$((stand + 1))
printf '%s\\n' "$stand" > "$MOCK_LOG_DIR/curl.zaehler"
(( stand >= \${MOCK_CURL_BEREIT_AB:-1} ))`);
  stub('launchctl', `case "$1" in
kickstart) exit \${MOCK_KICKSTART_STATUS:-0} ;;
load) exit \${MOCK_LOAD_STATUS:-0} ;;
*) exit 99 ;;
esac`);
  stub('open', 'exit ${MOCK_OPEN_STATUS:-0}');
  const variablen = { ...process.env };
  for (const name of ['PORT', 'TP_DASHBOARD_APP_URL', 'TP_PRIVAT_DIR']) delete variablen[name];
  const aufrufe = name => {
    const datei = path.join(logs, `${name}.args`);
    return fs.existsSync(datei) ? fs.readFileSync(datei, 'utf8').split('\0\0').filter(Boolean).map(s => s.split('\0')) : [];
  };
  // Nur die Browser-Inventur ersetzen: Tests sehen weder echte installierte Apps
  // noch oeffnen sie sie. Alle Wirkungskommandos stammen aus dem privaten bin/.
  const shell = `test() {
  if [[ "$#" == 2 && "$1" == '-d' && "$2" == *.app ]]; then
    [[ "|\${MOCK_APPS:-}|" == *"|$2|"* ]]; return
  fi
  builtin test "$@"
}
source "$1"`;
  const starten = extra => spawnSync('/bin/bash', ['-c', shell, 'dashboard-app-test', STARTER], {
    env: { ...variablen, PATH: `${bin}:/usr/bin:/bin`, TP_PRIVAT_DIR: privat, MOCK_LOG_DIR: logs, MOCK_APPS: apps.join('|'), ...env, ...extra },
    encoding: 'utf8', timeout: ZEITLIMIT_MS,
  });
  return { dir, privat, starten, aufrufe };
}

test('Standard oeffnet localhost in Chrome als App, ohne den bereiten Dienst neu zu starten', t => {
  const u = umgebung(t), r = u.starten();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(u.aufrufe('open'), [['-n', '-a', CHROME, '--args', '--app=http://localhost:8001']]);
  assert.equal(u.aufrufe('launchctl').length, 0);
  assert.equal(u.aufrufe('curl').length, 1);
  assert(u.aufrufe('curl')[0].includes('--fail'));
  assert.equal(fs.statSync(path.join(u.privat, 'dashboard-start.log')).mode & 0o777, 0o600);
});

test('Chrome im Benutzerordner hat Vorrang vor Edge; andernfalls dient Edge als App-Browser', t => {
  for (const [apps, erwartet] of [[[EDGE, BENUTZER_CHROME], BENUTZER_CHROME], [[EDGE], EDGE], [[BENUTZER_EDGE], BENUTZER_EDGE]]) {
    const u = umgebung(t, { apps }), r = u.starten();
    assert.equal(r.status, 0, r.stderr);
    assert.equal(u.aufrufe('open')[0][2], erwartet);
  }
});

test('fehlender Chromium-Browser fuehrt zu einem klaren Fehler ohne Standardbrowser-Ausweg', t => {
  const u = umgebung(t, { apps: [] }), r = u.starten();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Chrome oder Microsoft Edge fehlt/);
  assert.deepEqual(u.aufrufe('open'), []);
  assert.deepEqual(u.aufrufe('launchctl'), []);
});

test('HTTPS-Adresse oeffnet unveraendert die gemeinsame Zentrale und weckt keinen lokalen Dienst', t => {
  const ziel = 'https://dashboard.example.invalid/#/lexikon?tab=druckliste';
  const u = umgebung(t, { env: { TP_DASHBOARD_APP_URL: ziel } }), r = u.starten();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(u.aufrufe('open')[0].at(-1), `--app=${ziel}`);
  assert.equal(u.aufrufe('curl')[0].at(-1), ziel);
  assert.equal(u.aufrufe('launchctl').length, 0);
  const log = fs.readFileSync(path.join(u.privat, 'dashboard-start.log'), 'utf8');
  assert(log.includes('https://dashboard.example.invalid'));
  assert(!log.includes('tab=druckliste'));
});

test('nicht erreichbares entferntes HTTPS startet keinen lokalen Dienst und kein App-Fenster', t => {
  const u = umgebung(t, { env: { TP_DASHBOARD_APP_URL: 'https://dashboard.example.invalid', MOCK_CURL_BEREIT_AB: '999' } }), r = u.starten();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /kein lokaler Dienst gestartet/);
  assert.equal(u.aufrufe('curl').length, 1);
  assert.deepEqual(u.aufrufe('launchctl'), []);
  assert.deepEqual(u.aufrufe('open'), []);
});

test('HTTP-Netzadressen, fremde Protokolle und ungueltige URL-Ports werden vor jedem Aufruf abgelehnt', t => {
  for (const ziel of ['http://192.168.2.222:8001', 'http://localhost.example.invalid:8001', 'file:///tmp/dashboard.html', 'javascript:alert(1)', 'https://user:geheim@dashboard.example.invalid', 'https://dashboard.example.invalid:0', 'https://dashboard.example.invalid:65536', 'https://dashboard.example.invalid:abc', 'https://dashboard.example.invalid/mit leerzeichen', 'https://dashboard.example.invalid\\pfad', 'https:///ohne-host']) {
    const u = umgebung(t, { env: { TP_DASHBOARD_APP_URL: ziel } }), r = u.starten();
    assert.equal(r.status, 1, ziel);
    assert.deepEqual(u.aufrufe('curl'), [], ziel);
    assert.deepEqual(u.aufrufe('open'), [], ziel);
    assert.deepEqual(u.aufrufe('launchctl'), [], ziel);
    assert(!r.stderr.includes('geheim'));
  }
});

test('sichere Loopback-Adressen und angepasster Port bleiben erlaubt', t => {
  for (const ziel of ['http://localhost:8123', 'http://127.0.0.1:8123/#/lexikon', 'http://[::1]:8123']) {
    const u = umgebung(t, { env: { PORT: '8123', TP_DASHBOARD_APP_URL: ziel } }), r = u.starten();
    assert.equal(r.status, 0, r.stderr);
    assert.equal(u.aufrufe('open')[0].at(-1), `--app=${ziel}`);
  }
  const u = umgebung(t, { env: { PORT: '08001' } });
  assert.equal(u.starten().status, 0);
  assert.equal(u.aufrufe('open')[0].at(-1), '--app=http://localhost:8001');
});

test('ungueltige PORT-Konfiguration wird nicht als Shell-Code oder Adresse verwendet', t => {
  for (const port of ['0', '65536', '8001x', '-1', '1.2', ' 8001', '$(touch marker)']) {
    const u = umgebung(t, { env: { PORT: port } }), r = u.starten();
    assert.equal(r.status, 1, port);
    assert.match(r.stderr, /PORT muss/);
    assert.deepEqual(u.aufrufe('curl'), []);
    assert.deepEqual(u.aufrufe('open'), []);
  }
});

test('unbereiter lokaler Dienst wird einmal geweckt und erst nach erfolgreicher Gegenprobe geoeffnet', t => {
  const u = umgebung(t, { env: { MOCK_CURL_BEREIT_AB: '3' } }), r = u.starten();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(u.aufrufe('launchctl'), [['kickstart', '-k', 'gui/501/net.teppich-paradies.dashboard']]);
  assert.equal(u.aufrufe('curl').length, 3);
  assert.equal(u.aufrufe('sleep').length, 1);
  assert.equal(u.aufrufe('open').length, 1);
});

test('nicht geladener Dienst verwendet die vorhandene LaunchAgent-Datei als Rueckfall', t => {
  const u = umgebung(t, { env: { MOCK_CURL_BEREIT_AB: '2', MOCK_KICKSTART_STATUS: '1' } }), r = u.starten();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(u.aufrufe('launchctl'), [['kickstart', '-k', 'gui/501/net.teppich-paradies.dashboard'], ['load', path.join(os.homedir(), 'Library/LaunchAgents/net.teppich-paradies.dashboard.plist')]]);
  assert.equal(u.aufrufe('open').length, 1);
});

test('ausbleibender Dienst und gescheiterter Start oeffnen nie ein leeres App-Fenster', t => {
  const u = umgebung(t, { env: { MOCK_CURL_BEREIT_AB: '999' } }), r = u.starten();
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /nach 20 Sekunden/);
  assert(u.aufrufe('curl').length > 1 && u.aufrufe('curl').length <= 41);
  assert.deepEqual(u.aufrufe('open'), []);
  const v = umgebung(t, { env: { MOCK_CURL_BEREIT_AB: '999', MOCK_KICKSTART_STATUS: '1', MOCK_LOAD_STATUS: '1' } }), s = v.starten();
  assert.equal(s.status, 1);
  assert.match(s.stderr, /konnte nicht gestartet werden/);
  assert.deepEqual(v.aufrufe('open'), []);
});

test('andere Loopback-Ports starten nicht versehentlich den konfigurierten Dashboard-Dienst', t => {
  const u = umgebung(t, { env: { TP_DASHBOARD_APP_URL: 'http://localhost:8123', MOCK_CURL_BEREIT_AB: '999' } }), r = u.starten();
  assert.equal(r.status, 1);
  assert.deepEqual(u.aufrufe('launchctl'), []);
});

test('URL-Zeichen werden als ein Argument uebergeben und niemals als Shell-Code ausgefuehrt', t => {
  const u = umgebung(t), marker = path.join(u.dir, 'unerlaubt');
  const ziel = `https://dashboard.example.invalid/?literal=$(/usr/bin/touch\${IFS}${marker})`;
  const r = u.starten({ TP_DASHBOARD_APP_URL: ziel });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(u.aufrufe('open')[0].at(-1), `--app=${ziel}`);
  assert.equal(fs.existsSync(marker), false);
});

test('fehlgeschlagener App-Aufruf meldet den Fehler und nimmt keinen anderen Browser', t => {
  const u = umgebung(t, { env: { MOCK_OPEN_STATUS: '1' } }), r = u.starten();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /App-Fenster konnte nicht geoeffnet/);
  assert.equal(u.aufrufe('open').length, 1);
});
