import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pruefeZugaenge, leseStatus, schreibeStatus, statusPfad } from '../lib/zugaenge.mjs';
import { statusPfad as routinePfad } from '../lib/routinen.mjs';

const JETZT = new Date('2026-01-10T08:00:00Z');

/** Privatordner mit dem Stand eines Postfach-Dienstes (null: keiner). */
function privatOrdner(postfach = { vorpruefungGrund: 'nichts Neues' }, { id = 'lieferbelege', zeit = '2026-01-10T07:00:00Z' } = {}) {
  const privat = fs.mkdtempSync(path.join(os.tmpdir(), 'zugaenge-'));
  if (postfach) {
    const datei = routinePfad(privat, id);
    fs.mkdirSync(path.dirname(datei), { recursive: true });
    fs.writeFileSync(datei, JSON.stringify({ zeit, ...postfach }));
  }
  return privat;
}

const abgelehnt = { vorpruefungGrund: 'Vorprüfung nicht möglich: IMAP-Anmeldung abgelehnt (App-Passwort)' };
const pruefe = (extra = {}) => pruefeZugaenge({ privat: privatOrdner(), jetzt: JETZT, ausfuehren: befehle(), ...extra });

const scheitert = (extra) => () => { throw Object.assign(new Error('Befehl gescheitert'), { status: 1, stdout: '', stderr: '', ...extra }); };

/** Simulierte Befehle: `antworten` je Programmname, sonst gruen. */
function befehle(antworten = {}) {
  return (bin) => {
    const name = path.basename(bin);
    if (antworten[name]) return antworten[name]();
    return name === 'claude' ? '{"loggedIn": true}' : 'ok';
  };
}

const zustaende = (status) => Object.fromEntries(Object.values(status.zugaenge).map(z => [z.id, z.zustand]));

test('alles gueltig: alle gruen, nichts neu rot', () => {
  const { status, neuRot } = pruefe();
  assert.deepEqual(zustaende(status), { claude: 'ok', github: 'ok', 'apps-script': 'ok', shopify: 'ok', postfach: 'ok' });
  assert.deepEqual(neuRot, []);
});

test('erkannte Anmeldefehler sind rot', () => {
  const ausfuehren = befehle({
    claude: scheitert({ stdout: '{"loggedIn": false}' }),
    gh: scheitert({ stderr: 'You are not logged into any GitHub hosts. You are not logged in to github.com' }),
    clasp: scheitert({ stderr: 'Error: invalid_grant (invalid_rapt)' }),
    shopify: scheitert({ stderr: 'No stored app authentication found. Run shopify store auth' }),
  });
  const { status, neuRot } = pruefe({ privat: privatOrdner(abgelehnt), ausfuehren });
  assert.deepEqual(Object.values(zustaende(status)), ['rot', 'rot', 'rot', 'rot', 'rot']);
  assert.equal(neuRot.length, 5);
});

test('Netzfehler, Zeitlimit und fehlendes Programm sind unklar, nicht rot', () => {
  const ausfuehren = befehle({
    claude: scheitert({ code: 'ENOENT' }),
    gh: scheitert({ stderr: 'Timeout trying to log in to github.com' }),
    clasp: scheitert({ code: 'ETIMEDOUT', stderr: 'clasp login' }),
    shopify: scheitert({ stderr: 'getaddrinfo ENOTFOUND' }),
  });
  const { status, neuRot } = pruefe({ privat: privatOrdner(null), ausfuehren });
  assert.deepEqual(Object.values(zustaende(status)), ['unklar', 'unklar', 'unklar', 'unklar', 'unklar']);
  assert.deepEqual(neuRot, []);
});

test('rot bleibt bei unklar rot, mit altem Beginn und ohne neue Meldung', () => {
  const rot = pruefe({ ausfuehren: befehle({ gh: scheitert({ stderr: 'The token is invalid' }) }) });
  const danach = pruefe({ vorher: rot.status, jetzt: new Date('2026-01-11T08:00:00Z'), ausfuehren: befehle({ gh: scheitert({ code: 'ETIMEDOUT' }) }) });
  assert.equal(danach.status.zugaenge.github.zustand, 'rot');
  assert.equal(danach.status.zugaenge.github.seit, JETZT.toISOString());
  assert.deepEqual(danach.neuRot, []);
});

test('Postfach: der juengste Dienststand gilt, alte und unklare Staende zaehlen nicht', () => {
  const postfach = (privat) => pruefe({ privat }).status.zugaenge.postfach.zustand;
  assert.equal(postfach(privatOrdner({ meldung: 'IMAP-Anmeldung abgelehnt' }, { id: 'postfach-entwuerfe' })), 'rot');
  assert.equal(postfach(privatOrdner(abgelehnt, { zeit: '2026-01-01T07:00:00Z' })), 'unklar');
  assert.equal(postfach(privatOrdner({ vorpruefungGrund: 'Vorprüfung nicht möglich: IMAP: Zeitlimit (30 s)' })), 'unklar');
  const privat = privatOrdner(abgelehnt);
  fs.writeFileSync(routinePfad(privat, 'serviceanfragen'), JSON.stringify({ zeit: '2026-01-10T07:30:00Z', vorpruefungGrund: 'neue Mails' }));
  assert.equal(postfach(privat), 'ok');
});

test('Statusdatei enthaelt keine Befehlsausgaben', () => {
  const privat = privatOrdner();
  const { status } = pruefe({ privat, ausfuehren: befehle({ gh: scheitert({ stderr: 'token ghx_geheim is invalid' }) }) });
  schreibeStatus(statusPfad(privat), status);
  assert.doesNotMatch(fs.readFileSync(statusPfad(privat), 'utf8'), /ghx_geheim/);
  assert.equal(leseStatus(statusPfad(privat)).zugaenge.github.zustand, 'rot');
});
