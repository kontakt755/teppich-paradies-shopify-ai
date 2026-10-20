// Datenkopie der Pruef-Instanz (npm run dashboard:pruefen): sie enthaelt Kunden- und
// Einkaufsdaten und darf nach dem Beenden nicht im Temp-Ordner liegen bleiben.
// Bis 2026-10-19 blieb sie nach `kill <pid>` jedes Mal stehen (16 Kopien).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  datenkopieAnlegen, istDatenkopie, datenkopieLoeschen, beimEndeLoeschen, verwaisteDatenkopien,
} from '../../../scripts/dashboard-datenkopie.mjs';

const SERVER = fileURLToPath(new URL('../../../scripts/serve-dashboard.mjs', import.meta.url));
const EIN_TAG_MS = 24 * 60 * 60 * 1000;

// Eigener "Temp-Ordner" je Test, damit nie eine echte Kopie im Temp-Ordner des Rechners zaehlt.
function mitTmp(run) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-datenkopie-test-'));
  try { return run(tmp); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

test('nur ein echtes Verzeichnis tp-dashboard-daten-XXXXXX direkt im Temp-Ordner gilt als Kopie', () => mitTmp(tmp => {
  const kopie = datenkopieAnlegen(tmp);
  assert.match(path.basename(kopie), /^tp-dashboard-daten-[A-Za-z0-9]{6}$/);
  assert.equal(istDatenkopie(kopie, tmp), true);

  const fremd = path.join(tmp, 'teppich-paradies-analyse');
  fs.mkdirSync(fremd);
  assert.equal(istDatenkopie(fremd, tmp), false, 'falscher Name');
  const tiefer = path.join(fremd, 'tp-dashboard-daten-abcdef');
  fs.mkdirSync(tiefer);
  assert.equal(istDatenkopie(tiefer, tmp), false, 'nicht direkt im Temp-Ordner');
  const link = path.join(tmp, 'tp-dashboard-daten-link00');
  fs.symlinkSync(fremd, link);
  assert.equal(istDatenkopie(link, tmp), false, 'ein Link wird nie geloescht');
  assert.equal(istDatenkopie(path.join(tmp, 'tp-dashboard-daten-fehlt0'), tmp), false, 'fehlt');
  assert.equal(istDatenkopie(kopie, fremd), false, 'anderer Temp-Ordner');
  assert.equal(istDatenkopie('', tmp), false);
  assert.equal(istDatenkopie(undefined, tmp), false);

  assert.equal(datenkopieLoeschen(fremd, tmp), false);
  assert.ok(fs.existsSync(fremd));
}));

test('Loeschen entfernt die Kopie, nie die verlinkten echten Exporte', () => mitTmp(tmp => {
  const privat = path.join(tmp, 'privat');
  fs.mkdirSync(path.join(privat, 'lexikon'), { recursive: true });
  fs.writeFileSync(path.join(privat, 'lexikon', 'lexikon.json'), '{}');
  const kopie = datenkopieAnlegen(tmp);
  fs.symlinkSync(path.join(privat, 'lexikon'), path.join(kopie, 'lexikon'));
  fs.writeFileSync(path.join(kopie, 'auftragsstatus.json'), '{}');

  assert.equal(datenkopieLoeschen(kopie, tmp), true);
  assert.equal(fs.existsSync(kopie), false);
  assert.ok(fs.existsSync(path.join(privat, 'lexikon', 'lexikon.json')), 'Ziel des Links bleibt');
}));

function falscherProzess() {
  const proc = new EventEmitter();
  proc.exitCodes = [];
  proc.exit = code => { proc.exitCodes.push(code); proc.emit('exit', code); };
  return proc;
}

test('Server raeumt beim Beenden nur auf, wenn TP_DASHBOARD_DATENKOPIE = TP_PRIVAT_DIR und eine Kopie ist', () => mitTmp(tmp => {
  const kopie = datenkopieAnlegen(tmp);
  const fehler = console.error;
  console.error = () => {};
  try {
    // Echter Dienst: Variable fehlt - keine Handler, nichts geloescht.
    const ohne = falscherProzess();
    assert.equal(beimEndeLoeschen({ env: { TP_PRIVAT_DIR: kopie }, proc: ohne, tmp }), null);
    assert.equal(ohne.listenerCount('SIGTERM'), 0);

    // Zeigt auf einen anderen Ordner als TP_PRIVAT_DIR (z. B. den echten Privatordner).
    const anders = falscherProzess();
    assert.equal(beimEndeLoeschen({ env: { TP_PRIVAT_DIR: path.join(tmp, 'privat'), TP_DASHBOARD_DATENKOPIE: kopie }, proc: anders, tmp }), null);
    assert.equal(anders.listenerCount('exit'), 0);

    // Kein Ordner im Temp-Ordner.
    const echt = path.join(tmp, 'privat');
    fs.mkdirSync(echt);
    const daneben = falscherProzess();
    assert.equal(beimEndeLoeschen({ env: { TP_PRIVAT_DIR: echt, TP_DASHBOARD_DATENKOPIE: echt }, proc: daneben, tmp }), null);
    daneben.emit('exit');
    assert.ok(fs.existsSync(echt));
  } finally {
    console.error = fehler;
  }

  const proc = falscherProzess();
  assert.equal(beimEndeLoeschen({ env: { TP_PRIVAT_DIR: kopie, TP_DASHBOARD_DATENKOPIE: kopie }, proc, tmp }), kopie);
  proc.emit('SIGTERM');
  assert.deepEqual(proc.exitCodes, [143]);
  assert.equal(fs.existsSync(kopie), false);
}));

test('verwaiste Kopien: nur aelter als ein Tag und ohne laufenden Prozess', () => mitTmp(tmp => {
  const verwaist = datenkopieAnlegen(tmp);
  const inBenutzung = datenkopieAnlegen(tmp);
  fs.mkdirSync(path.join(tmp, 'tp-dashboard-daten-zu-lang-fuer-mkdtemp'));
  fs.mkdirSync(path.join(tmp, 'tp-dashboard-pruefung-abcdef'));
  const ps = `node scripts/serve-dashboard.mjs PORT=6001 TP_PRIVAT_DIR=${inBenutzung} TP_DASHBOARD_DATENKOPIE=${inBenutzung}\n`;
  const morgen = Date.now() + 2 * EIN_TAG_MS;

  assert.deepEqual(verwaisteDatenkopien({ tmp, jetzt: morgen, prozesse: () => ps, lebt: () => false, benutzt: () => false }), [verwaist]);
  // Gerade angelegt: ein paralleler Lauf kopiert vielleicht noch.
  assert.deepEqual(verwaisteDatenkopien({ tmp, jetzt: Date.now(), prozesse: () => ps, lebt: () => false, benutzt: () => false }), []);
  // Laesst sich nicht feststellen, ob ein Prozess darauf laeuft (Windows): nichts loeschen.
  assert.deepEqual(verwaisteDatenkopien({ tmp, jetzt: morgen, prozesse: () => null }), []);
}));

test('Pruef-Instanz: kill <pid> beendet den Server und loescht seine Datenkopie', { skip: process.platform === 'win32' && 'Windows kennt kein SIGTERM mit Handler' }, async () => {
  const kopie = datenkopieAnlegen();
  fs.writeFileSync(path.join(kopie, 'auftragsstatus.json'), '{}');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(SHOPIFY_|LADEN_ZAHLEN_|AUFTRAGS_APP_URL$|WERKBANK_URL$)/.test(k)));
  const server = spawn(process.execPath, [SERVER], {
    env: {
      ...env, PORT: '0', TP_DASHBOARD_HOST: '127.0.0.1', TP_PRIVAT_DIR: kopie, TP_DASHBOARD_DATENKOPIE: kopie,
      TP_DASHBOARD_PASSWORT: randomBytes(8).toString('hex'), TP_ENV_LOCAL: path.join(kopie, 'kein-zugang.env.local'),
      TP_TAILSCALE_PRUEFEN: '0', TP_VERBRAUCH_AUTO: '0', TP_DASHBOARD_NEUBAU_MINUTEN: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    let ausgabe = '';
    await new Promise((ok, fehler) => {
      const zeit = setTimeout(() => fehler(new Error(`Server startet nicht: ${ausgabe}`)), 15_000);
      server.stdout.on('data', d => { ausgabe += d; if (/Control Center/.test(ausgabe)) { clearTimeout(zeit); ok(); } });
      server.stderr.on('data', d => { ausgabe += d; });
      server.on('exit', code => { clearTimeout(zeit); fehler(new Error(`Server endete vorzeitig (${code}): ${ausgabe}`)); });
    });
    assert.ok(fs.existsSync(kopie));
    const ende = new Promise(ok => server.once('exit', (code, signal) => ok({ code, signal })));
    server.kill('SIGTERM');
    assert.deepEqual(await ende, { code: 143, signal: null });
    assert.equal(fs.existsSync(kopie), false, 'Datenkopie liegt nach kill noch im Temp-Ordner');
  } finally {
    server.kill('SIGKILL');
    fs.rmSync(kopie, { recursive: true, force: true });
  }
});
