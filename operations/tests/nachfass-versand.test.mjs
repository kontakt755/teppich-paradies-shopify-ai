import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  postfachPfad, stopplistePfad, versandPfad, lesePostfach, leseStoppliste, abgemeldeteAdressen, trageAbmeldungEin,
  leseVersand, schreibeVersand, schonVerschickt, kopieNoetig, mitlesenBis, versandStand, NachfassFehler, MITLESEN_TAGE, UNTERSCHRIFT_STANDARD,
} from '../lib/nachfass-versand.mjs';

// Nur erfundene Daten: Adressen unter example.invalid, Platzhalter statt Passwort.
const privat = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tp-nachfass-'));
const POSTFACH = { host: 'mail.example.invalid', port: 465, benutzer: 'kontakt@example.invalid', passwort: 'platzhalter-1', absender: 'kontakt@example.invalid' };
const schreibPostfach = (dir, daten, mode = 0o600) => { fs.mkdirSync(path.dirname(postfachPfad(dir)), { recursive: true }); fs.writeFileSync(postfachPfad(dir), JSON.stringify(daten), { mode }); };
const JETZT = new Date('2026-10-20T08:00:00Z');

test('Postfach: fehlt -> Hinweis mit Dateiname; zu offene Rechte -> nichts; Pflichtfelder; Standardwerte', () => {
  const dir = privat();
  const fehlt = lesePostfach(postfachPfad(dir));
  assert.equal(fehlt.fehlt, true);
  assert.match(fehlt.hinweis, /nachfassen\/postfach\.json/);

  schreibPostfach(dir, POSTFACH, 0o644);
  const offen = lesePostfach(postfachPfad(dir));
  assert.equal(offen.zugang, undefined);
  assert.match(offen.hinweis, /chmod 600/);

  fs.chmodSync(postfachPfad(dir), 0o600);
  const ok = lesePostfach(postfachPfad(dir));
  assert.deepEqual(ok.zugang, {
    host: 'mail.example.invalid', port: 465, sicherheit: 'tls', benutzer: 'kontakt@example.invalid', passwort: 'platzhalter-1',
    absender: 'kontakt@example.invalid', absenderName: 'Teppich Paradies', unterschrift: UNTERSCHRIFT_STANDARD,
    kopie: 'kontakt@example.invalid', kopieImmer: false,
  });

  schreibPostfach(dir, { ...POSTFACH, port: 587, kopie: 'buero@example.invalid', kopieImmer: true, unterschrift: 'Anna Beispiel' });
  const z = lesePostfach(postfachPfad(dir)).zugang;
  assert.deepEqual([z.sicherheit, z.kopie, z.kopieImmer, z.unterschrift], ['starttls', 'buero@example.invalid', true, 'Anna Beispiel']);
  // "kopie": false: keine Blindkopie, auch nicht mit kopieImmer.
  schreibPostfach(dir, { ...POSTFACH, kopie: false, kopieImmer: true });
  assert.equal(lesePostfach(postfachPfad(dir)).zugang.kopie, null);

  schreibPostfach(dir, { host: 'x' });
  assert.match(lesePostfach(postfachPfad(dir)).hinweis, /es fehlt port, benutzer, passwort, absender/);
  schreibPostfach(dir, { ...POSTFACH, sicherheit: 'ssl' });
  assert.match(lesePostfach(postfachPfad(dir)).hinweis, /tls oder starttls/);
  fs.writeFileSync(postfachPfad(dir), '{kaputt', { mode: 0o600 });
  assert.match(lesePostfach(postfachPfad(dir)).hinweis, /beschädigt/);
});

test('Stoppliste: eintragen, Adresse klein, zweiter Eintrag aendert nichts, beschaedigt wirft', () => {
  const dir = privat();
  const file = stopplistePfad(dir);
  assert.deepEqual(leseStoppliste(file), {});
  const r = trageAbmeldungEin(file, { email: ' Kunde@Example.invalid ', von: 'Anna', orderId: 'gid://shopify/Order/1', jetzt: JETZT });
  assert.equal(r.neu, true);
  assert.deepEqual(r.eintrag, { am: JETZT.toISOString(), von: 'Anna', grund: 'Antwort „Abmelden“', orderId: 'gid://shopify/Order/1' });
  assert.deepEqual(Object.keys(leseStoppliste(file)), ['kunde@example.invalid']);
  assert.equal((fs.statSync(file).mode & 0o077), 0, 'Datei nur fuer den Benutzer lesbar');

  const nochmal = trageAbmeldungEin(file, { email: 'kunde@example.invalid', von: 'Bernd', jetzt: new Date('2026-11-01T00:00:00Z') });
  assert.equal(nochmal.neu, false);
  assert.equal(nochmal.eintrag.von, 'Anna', 'die erste Abmeldung bleibt');
  assert.deepEqual([...abgemeldeteAdressen(leseStoppliste(file)).entries()], [['kunde@example.invalid', { am: JETZT.toISOString(), von: 'Anna' }]]);

  assert.throws(() => trageAbmeldungEin(file, { email: 'ohne-at', von: 'Anna' }), e => e instanceof NachfassFehler && e.status === 400);
  assert.throws(() => trageAbmeldungEin(file, { email: 'x@example.invalid', von: '' }), /fehlt/);
  fs.writeFileSync(file, '{kaputt');
  assert.throws(() => leseStoppliste(file), e => e instanceof NachfassFehler && e.status === 500 && /beschädigt/.test(e.message));
  assert.throws(() => trageAbmeldungEin(file, { email: 'x@example.invalid', von: 'Anna' }), /beschädigt/, 'auf eine kaputte Datei wird nicht geschrieben');
});

test('Versandprotokoll: leer ohne Datei, Doppelschutz je Bestellung und Stufe, Kopie in der ersten Woche', () => {
  const dir = privat();
  const file = versandPfad(dir);
  assert.deepEqual(leseVersand(file), { ersterVersandAm: null, letzterLauf: null, sendungen: [] });
  const v = leseVersand(file);
  v.sendungen.push({ am: JETZT.toISOString(), orderId: 'o1', stufe: 'erste', status: 'gesendet' }, { am: JETZT.toISOString(), orderId: 'o2', stufe: 'erste', status: 'fehler' });
  v.ersterVersandAm = JETZT.toISOString();
  schreibeVersand(file, v);
  const w = leseVersand(file);
  assert.equal(schonVerschickt(w, 'o1', 'erste').status, 'gesendet');
  assert.equal(schonVerschickt(w, 'o1', 'erinnerung'), null, 'die Erinnerung ist eine eigene Stufe');
  assert.equal(schonVerschickt(w, 'o2', 'erste'), null, 'ein Fehlversuch sperrt nicht');

  assert.equal(kopieNoetig({ ersterVersandAm: null, jetzt: JETZT }), true, 'vor dem ersten Versand: Kopie');
  assert.equal(kopieNoetig({ ersterVersandAm: JETZT.toISOString(), jetzt: new Date(JETZT.getTime() + (MITLESEN_TAGE - 1) * 86400000) }), true);
  assert.equal(kopieNoetig({ ersterVersandAm: JETZT.toISOString(), jetzt: new Date(JETZT.getTime() + MITLESEN_TAGE * 86400000) }), false);
  assert.equal(kopieNoetig({ ersterVersandAm: JETZT.toISOString(), jetzt: new Date(JETZT.getTime() + 30 * 86400000), immer: true }), true);
  assert.equal(mitlesenBis({ ersterVersandAm: JETZT.toISOString() }), new Date(JETZT.getTime() + MITLESEN_TAGE * 86400000).toISOString());
  assert.equal(mitlesenBis({ immer: true }), 'immer');
  assert.equal(mitlesenBis({}), null);
});

test('versandStand fuer die Karte: nicht eingerichtet mit Hinweis; eingerichtet mit letztem Lauf und Kopie-bis', () => {
  const dir = privat();
  const a = versandStand(dir, { jetzt: JETZT });
  assert.deepEqual([a.eingerichtet, a.letzterLauf, a.mitlesenBis, a.kopie], [false, null, null, null]);
  assert.match(a.hinweis, /nicht eingerichtet/);

  schreibPostfach(dir, POSTFACH);
  schreibeVersand(versandPfad(dir), { ersterVersandAm: JETZT.toISOString(), letzterLauf: { am: JETZT.toISOString(), verschickt: 2, fehler: 0 }, sendungen: [] });
  const b = versandStand(dir, { jetzt: new Date(JETZT.getTime() + 86400000) });
  assert.deepEqual([b.eingerichtet, b.hinweis, b.letzterLauf.verschickt, b.kopie], [true, null, 2, 'kontakt@example.invalid']);
  assert.equal(b.mitlesenBis, new Date(JETZT.getTime() + MITLESEN_TAGE * 86400000).toISOString());
  const c = versandStand(dir, { jetzt: new Date(JETZT.getTime() + 10 * 86400000) });
  assert.equal(c.mitlesenBis, null, 'Woche vorbei - keine Kopie mehr');

  fs.writeFileSync(versandPfad(dir), '{kaputt');
  const d = versandStand(dir, { jetzt: JETZT });
  assert.equal(d.eingerichtet, true);
  assert.match(d.hinweis, /beschädigt/, 'ein kaputtes Protokoll ist ein Hinweis, keine Ausnahme');
});
