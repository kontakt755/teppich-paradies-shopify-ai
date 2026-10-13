import test from 'node:test';
import assert from 'node:assert/strict';
import { werteAus, brauchtHandlung, leseTailscaleStatus } from '../lib/tailscale.mjs';

const JETZT = () => new Date('2026-10-12T14:00:00.000Z');

test('werteAus: BackendState wird zu einem deutschen Zustand', () => {
  assert.deepEqual(werteAus({ BackendState: 'Running' }), { status: 'laeuft', zustand: 'Running' });
  assert.deepEqual(werteAus({ BackendState: 'Stopped' }), { status: 'gestoppt', zustand: 'Stopped' });
  assert.equal(werteAus({ BackendState: 'NeedsLogin' }).status, 'abgemeldet');
  assert.equal(werteAus({ BackendState: 'NeedsMachineAuth' }).status, 'abgemeldet');
  assert.equal(werteAus({ BackendState: 'Starting' }).status, 'startet');
  assert.deepEqual(werteAus({}), { status: 'unbekannt', zustand: null });
  assert.equal(brauchtHandlung({ status: 'gestoppt' }), true);
  assert.equal(brauchtHandlung({ status: 'abgemeldet' }), true);
  assert.equal(brauchtHandlung({ status: 'laeuft' }), false);
  assert.equal(brauchtHandlung({ status: 'nicht-installiert' }), false);
});

test('leseTailscaleStatus fragt nur `status --json` ab - nie up, down oder login', async () => {
  const aufrufe = [];
  const r = await leseTailscaleStatus({
    pfade: ['/x/tailscale'], existiert: () => true, env: {}, jetzt: JETZT,
    ausfuehren: async (pfad, args) => { aufrufe.push([pfad, ...args]); return { stdout: JSON.stringify({ BackendState: 'Stopped' }) }; },
  });
  assert.deepEqual(aufrufe, [['/x/tailscale', 'status', '--json']]);
  assert.deepEqual(r, { status: 'gestoppt', zustand: 'Stopped', geprueftAm: '2026-10-12T14:00:00.000Z' });
});

test('leseTailscaleStatus faellt nie mit einer Ausnahme aus', async () => {
  const ohne = await leseTailscaleStatus({ pfade: ['/nirgends'], existiert: () => false, env: {}, jetzt: JETZT });
  assert.equal(ohne.status, 'nicht-installiert');
  const aus = await leseTailscaleStatus({ env: { TP_TAILSCALE_PRUEFEN: '0' }, jetzt: JETZT, ausfuehren: async () => { throw new Error('darf nicht laufen'); } });
  assert.equal(aus.status, 'nicht-geprueft');
  // Exit 1, aber JSON auf stdout: trotzdem auswerten.
  const exit1 = await leseTailscaleStatus({
    pfade: ['/x'], existiert: () => true, env: {}, jetzt: JETZT,
    ausfuehren: async () => { const e = new Error('Command failed'); e.stdout = JSON.stringify({ BackendState: 'NeedsLogin' }); throw e; },
  });
  assert.equal(exit1.status, 'abgemeldet');
  const kaputt = await leseTailscaleStatus({
    pfade: ['/x'], existiert: () => true, env: {}, jetzt: JETZT,
    ausfuehren: async () => { throw new Error('spawn EACCES'); },
  });
  assert.equal(kaputt.status, 'unbekannt');
  assert.match(kaputt.meldung, /EACCES/);
});
