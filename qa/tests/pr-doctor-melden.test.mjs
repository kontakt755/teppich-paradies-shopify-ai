import test from 'node:test';
import assert from 'node:assert/strict';
import { baueEntwarnung, baueKommentar, entscheide, fingerprint, fingerprintAus, MARKER, SAUBER } from '../pr-doctor-melden.mjs';

const konflikt = { nummer: 288, head: 'x', regel: 'konflikt', schwere: 'error', text: '#288: 2 Konflikt(e) gegen main: a.liquid, b.liquid', fix: null };
const umzielen = { nummer: 5, head: 'y', regel: 'basis-nicht-main', schwere: 'warn', text: '#5: Basis-Branch alt ist geloescht; ohne Basis main laeuft keine PR-Validierung.', fix: { art: 'umzielen', neueBasis: 'main' } };
const info = { nummer: 5, head: 'y', regel: 'keine-checks', schwere: 'info', text: '#5: keine Checks gemeldet', fix: null };

test('Fingerabdruck: gleiche Befunde in anderer Reihenfolge -> gleich', () => {
  assert.equal(fingerprint([konflikt, umzielen]), fingerprint([umzielen, konflikt]));
});

test('Fingerabdruck: info-Befunde zaehlen nicht, ohne error/warn ist es sauber', () => {
  assert.equal(fingerprint([info]), SAUBER);
  assert.equal(fingerprint([]), SAUBER);
  assert.equal(fingerprint([umzielen, info]), fingerprint([umzielen]));
});

test('Fingerabdruck aendert sich, wenn sich der Befund aendert', () => {
  const anders = { ...konflikt, text: '#288: 1 Konflikt(e) gegen main: a.liquid' };
  assert.notEqual(fingerprint([konflikt]), fingerprint([anders]));
});

test('entscheide: unveraenderter Befund -> nichts, neuer -> posten', () => {
  const fp = fingerprint([konflikt]);
  assert.equal(entscheide({ letzterFingerprint: fp, aktuellerFingerprint: fp }), 'nichts');
  assert.equal(entscheide({ letzterFingerprint: null, aktuellerFingerprint: fp }), 'posten');
  assert.equal(entscheide({ letzterFingerprint: 'abcdefabcdef', aktuellerFingerprint: fp }), 'posten');
});

test('entscheide: wieder sauber -> entwarnen nur, wenn zuletzt etwas gemeldet war', () => {
  assert.equal(entscheide({ letzterFingerprint: fingerprint([konflikt]), aktuellerFingerprint: SAUBER }), 'entwarnen');
  assert.equal(entscheide({ letzterFingerprint: SAUBER, aktuellerFingerprint: SAUBER }), 'nichts');
  assert.equal(entscheide({ letzterFingerprint: null, aktuellerFingerprint: SAUBER }), 'nichts');
});

test('Kommentar traegt Marker mit Fingerabdruck und ist daraus wieder lesbar', () => {
  const body = baueKommentar({ findings: [konflikt], mainSha: '68017c7abcdef' });
  assert.ok(body.includes(MARKER));
  assert.equal(fingerprintAus(body), fingerprint([konflikt]));
  assert.match(body, /68017c7/);
});

test('Kommentar nennt die Konfliktdateien und den naechsten Schritt', () => {
  const body = baueKommentar({ findings: [konflikt, umzielen] });
  assert.match(body, /a\.liquid, b\.liquid/);
  assert.match(body, /Wegwerf-Worktree/);
  assert.match(body, /npm run pr:doctor -- --fix/);
  assert.match(body, /Workflow-Token/);
});

test('Entwarnung ist als sauber markiert', () => {
  assert.equal(fingerprintAus(baueEntwarnung({ mainSha: '68017c7' })), SAUBER);
});

test('fingerprintAus: fremder Kommentar ohne Marker -> null', () => {
  assert.equal(fingerprintAus('Danke, schaue ich mir an.'), null);
  assert.equal(fingerprintAus(''), null);
  assert.equal(fingerprintAus(undefined), null);
});
