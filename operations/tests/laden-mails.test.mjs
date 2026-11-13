// Mail-Abruf fuer die Ansicht Laden: nur lesend, ohne Netz (gefaelschte Verbindung), ohne den echten Privatordner.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ImapFehler } from '../lib/imap-lesen.mjs';
import {
  abrufenNurLesend, abrufenUndSpeichern, angebotAngenommen, leseLadenZugang, ladenPostfachPfad, ladenMailsPfad, dekodiereKopf, absenderAusFrom, internaldate,
} from '../lib/laden-mails.mjs';
import { ladenMails, setzeZustaendig } from '../lib/laden.mjs';

const JETZT = new Date('2026-11-11T10:00:00Z');
const GEHEIM = 'test-passwort-nie-sichtbar';
const ZUGANG = { host: 'imap.example.invalid', port: 993, benutzer: 'laden@example.invalid', passwort: GEHEIM };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-laden-mails-'));
const b64 = t => `=?utf-8?B?${Buffer.from(t).toString('base64')}?=`;

const KOEPFE = {
  5: `From: =?utf-8?Q?M=C3=BCller?= <Kunde.A@Example.com>\r\nSubject: ${b64('Anfrage Läufer')}\r\n =?iso-8859-1?Q?_Gr=FC=DFe?=\r\nMessage-ID: <abc@example.com>\r\n\r\n`,
  7: 'From: kunde-b@example.com\r\nSubject: Preis?\r\n\r\n',
  8: 'From: kunde-c@example.com\r\nSubject: Aw: Angebot AG324 von Teppich Paradies\r\n\r\n',
  9: 'From: kunde-d@example.com\r\nSubject: AW: Angebot AG325 von Teppich Paradies\r\n\r\n',
};
const RUMPF = {
  8: 'Content-Type: text/plain; charset=utf-8\r\n\r\nWir nehmen gern den Teppich und haben die Anzahlung getätigt.\r\n\r\nAm 30.10. schrieb Teppich Paradies: Haben Sie Fragen?\r\n',
  9: 'Content-Type: text/plain; charset=utf-8\r\n\r\nWir nehmen gern den Teppich. Wann können Sie liefern?\r\n',
};

/** Falscher IMAP-Server fuer ein gewoehnliches Postfach: merkt sich die Befehle. */
function falscherServer({ anmeldungOk = true, examine = '[READ-ONLY] geoeffnet', uids = [5, 7] } = {}) {
  const befehle = [];
  const verbinden = () => {
    const sock = new EventEmitter();
    const senden = text => setImmediate(() => sock.emit('data', Buffer.from(text)));
    sock.write = (zeile) => {
      const [marke, ...rest] = zeile.trim().split(' ');
      const cmd = rest.join(' ');
      befehle.push(cmd);
      if (cmd.startsWith('LOGIN')) senden(anmeldungOk ? `${marke} OK angemeldet\r\n` : `${marke} NO [AUTHENTICATIONFAILED] falsch\r\n`);
      else if (cmd.startsWith('EXAMINE')) senden(`* 3 EXISTS\r\n${marke} OK ${examine}\r\n`);
      else if (cmd.startsWith('UID SEARCH')) senden(`* SEARCH ${uids.join(' ')}\r\n${marke} OK\r\n`);
      else if (cmd.startsWith('UID FETCH') && cmd.includes('BODY.PEEK[]<')) {
        const wahl = cmd.split(' ')[2].split(',');
        senden(`${wahl.map((u, i) => `* ${i + 1} FETCH (UID ${u} BODY[]<0> {${Buffer.byteLength(RUMPF[u])}}\r\n${RUMPF[u]})\r\n`).join('')}${marke} OK\r\n`);
      } else if (cmd.startsWith('UID FETCH')) {
        const wahl = cmd.split(' ')[2].split(',');
        senden(`${wahl.map((u, i) => `* ${i + 1} FETCH (UID ${u} INTERNALDATE "1${u}-Nov-2026 09:00:00 +0100" BODY[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID)] {${Buffer.byteLength(KOEPFE[u])}}\r\n${KOEPFE[u]})\r\n`).join('')}${marke} OK\r\n`);
      } else if (cmd.startsWith('LOGOUT')) senden(`* BYE\r\n${marke} OK\r\n`);
      else senden(`${marke} BAD unbekannt\r\n`);
      return true;
    };
    sock.destroy = () => {};
    sock.end = () => {};
    senden('* OK bereit\r\n');
    return sock;
  };
  return { befehle, verbinden };
}

test('Abruf: nur LOGIN, EXAMINE, UID SEARCH, UID FETCH (BODY.PEEK), LOGOUT', async () => {
  const s = falscherServer();
  const r = await abrufenNurLesend(ZUGANG, { verbinden: s.verbinden, jetzt: JETZT });
  assert.deepEqual(s.befehle.map(c => c.split(' ').slice(0, c.startsWith('UID') ? 2 : 1).join(' ')), ['LOGIN', 'EXAMINE', 'UID SEARCH', 'UID FETCH', 'LOGOUT']);
  assert.equal(s.befehle[1], 'EXAMINE INBOX');
  assert.equal(s.befehle[2], 'UID SEARCH SINCE 28-Oct-2026 UNANSWERED UNDELETED');
  assert.match(s.befehle[3], /BODY\.PEEK\[HEADER\.FIELDS \(FROM SUBJECT MESSAGE-ID\)\]/);
  assert.ok(!s.befehle.some(c => /\b(STORE|COPY|EXPUNGE|APPEND|SELECT)\b/.test(c)));
  assert.equal(r.eintraege.length, 2);
});

test('Abruf: Kopfzeilen dekodiert, Schluessel passt zur Regel, neueste zuerst', async () => {
  const dir = tmp();
  const r = await abrufenNurLesend(ZUGANG, { verbinden: falscherServer().verbinden, jetzt: JETZT });
  const a = r.eintraege.find(e => e.adresse === 'kunde.a@example.com');
  assert.equal(a.von, 'Müller');
  assert.equal(a.text, 'Anfrage Läufer Grüße');
  assert.equal(a.seit, '2026-11-15T08:00:00.000Z');
  assert.equal(r.eintraege[0].adresse, 'kunde-b@example.com', 'neueste zuerst (Nr. 7 kam am 17.11., Nr. 5 am 15.11.)');
  assert.equal(r.eintraege.find(e => e.adresse === 'kunde-b@example.com').von, 'kunde-b@example.com');
  // Dieselbe Regel wie setzeZustaendig: ein Schluessel, der nicht passt, wuerfe "Unbekannter Eintrag".
  for (const e of r.eintraege) {
    assert.match(e.schluessel, /^mail:[0-9a-f]{16}$/);
    assert.doesNotThrow(() => setzeZustaendig(path.join(dir, 'z.json'), { schluessel: e.schluessel, wer: 'Person A', personen: ['Person A'] }));
  }
  assert.notEqual(r.eintraege[0].schluessel, r.eintraege[1].schluessel);
});

test('Kopf-Helfer: Wort-Kodierung, unbekannter Zeichensatz bleibt roh, Absender und Datum', () => {
  assert.equal(dekodiereKopf('=?UTF-8?q?a_b=C3=A4?= =?utf-8?B?Yw==?='), 'a bäc');
  assert.equal(dekodiereKopf('=?x-gibtsnicht?B?Yw==?='), '=?x-gibtsnicht?B?Yw==?=');
  assert.deepEqual(absenderAusFrom('"Person A" <A@Example.com>'), { name: 'Person A', adresse: 'a@example.com' });
  assert.deepEqual(absenderAusFrom('a@example.com'), { name: null, adresse: 'a@example.com' });
  assert.equal(internaldate('11-Nov-2026 10:00:00 +0100'), '2026-11-11T09:00:00.000Z');
  assert.equal(internaldate('Quatsch'), null);
});

test('Abruf: ohne [READ-ONLY] wird nichts gesucht oder geholt', async () => {
  const s = falscherServer({ examine: '[READ-WRITE] geoeffnet' });
  await assert.rejects(abrufenNurLesend(ZUGANG, { verbinden: s.verbinden, jetzt: JETZT }), ImapFehler);
  assert.ok(!s.befehle.some(c => c.startsWith('UID')));
});

test('Abruf: nur die neuesten max Mails werden geholt', async () => {
  const s = falscherServer({ uids: [5, 6, 7] });
  KOEPFE[6] = 'From: x@example.com\r\nSubject: S\r\n\r\n';
  await abrufenNurLesend(ZUGANG, { verbinden: s.verbinden, jetzt: JETZT, max: 2 });
  assert.match(s.befehle.find(c => c.startsWith('UID FETCH')), /^UID FETCH 6,7 /);
});

test('Beantwortet: Gesendet im Hauptpostfach an dieselbe Adresse nach Eingang markiert, sonst nicht', async () => {
  const gefragt = [];
  const mitNurLesenFn = async (zugang, arbeit) => arbeit({
    suche: async (q) => { gefragt.push(q); return [11, 12]; },
    kopf: async uid => Buffer.from(uid === 11
      ? 'To: "x@example.com" <Kunde.A@example.com>\r\nDate: Mon, 16 Nov 2026 12:00:00 +0100\r\n\r\n'
      : 'To: kunde-b@example.com\r\nDate: Mon, 02 Nov 2026 12:00:00 +0100\r\n\r\n'),
  });
  const r = await abrufenNurLesend(ZUGANG, { verbinden: falscherServer().verbinden, jetzt: JETZT, hauptZugang: { benutzer: 'a', passwort: 'b' }, mitNurLesenFn });
  assert.match(gefragt[0], /^in:sent newer_than:14d \{.*to:kunde\.a@example\.com.*\}$/);
  assert.match(gefragt[0], /to:kunde-b@example\.com/);
  assert.equal(r.eintraege.find(e => e.adresse === 'kunde.a@example.com').beantwortetAm, '2026-11-16T11:00:00.000Z');
  assert.equal(r.eintraege.find(e => e.adresse === 'kunde-b@example.com').beantwortetAm, undefined, 'vor dem Eingang gesendet zaehlt nicht');
  assert.equal(r.markierungFehler, null);
});

test('Beantwortet: Thread-Abgleich - Antwort an andere Adresse zaehlt, wenn In-Reply-To die Message-ID nennt', async () => {
  const gefragt = [];
  const mitNurLesenFn = async (zugang, arbeit) => arbeit({
    suche: async (q) => { gefragt.push(q); return [21, 22]; },
    kopf: async uid => Buffer.from(uid === 21
      ? 'To: andere@example.com\r\nIn-Reply-To: <x@example.com>\r\nReferences: <x@example.com> <ABC@example.com>\r\nDate: Mon, 16 Nov 2026 12:00:00 +0100\r\n\r\n'
      : 'To: dritte@example.com\r\nDate: Mon, 16 Nov 2026 13:00:00 +0100\r\n\r\n'),
  });
  const r = await abrufenNurLesend(ZUGANG, { verbinden: falscherServer().verbinden, jetzt: JETZT, hauptZugang: { benutzer: 'a', passwort: 'b' }, mitNurLesenFn });
  assert.match(gefragt[0], /subject:"Anfrage Läufer Grüße"/);
  assert.equal(r.eintraege.find(e => e.adresse === 'kunde.a@example.com').beantwortetAm, '2026-11-16T11:00:00.000Z');
  assert.equal(r.eintraege.find(e => e.adresse === 'kunde-b@example.com').beantwortetAm, undefined, 'fremde Mail ohne Bezug zaehlt nicht');
});

test('Beantwortet: scheitert das Hauptpostfach, bleibt der Abruf gueltig', async () => {
  const mitNurLesenFn = async () => { throw new ImapFehler('IMAP: kaputt'); };
  const r = await abrufenNurLesend(ZUGANG, { verbinden: falscherServer().verbinden, jetzt: JETZT, hauptZugang: { benutzer: 'a', passwort: 'b' }, mitNurLesenFn });
  assert.equal(r.eintraege.length, 2);
  assert.ok(r.eintraege.every(e => !e.beantwortetAm));
  assert.match(r.markierungFehler, /kaputt/);
});

test('Zugangsdatei: fehlt, fuer andere lesbar, beschaedigt, unvollstaendig, gueltig (Standardport 993)', () => {
  const dir = tmp();
  const datei = ladenPostfachPfad(dir);
  assert.deepEqual(leseLadenZugang(datei), { fehlt: true });
  fs.writeFileSync(datei, JSON.stringify({ host: 'h', benutzer: 'b', passwort: GEHEIM }), { mode: 0o644 });
  fs.chmodSync(datei, 0o644);
  assert.match(leseLadenZugang(datei).hinweis, /chmod 600/);
  fs.chmodSync(datei, 0o600);
  assert.deepEqual(leseLadenZugang(datei), { zugang: { host: 'h', port: 993, benutzer: 'b', passwort: GEHEIM } });
  fs.writeFileSync(datei, '{kaputt', { mode: 0o600 });
  assert.match(leseLadenZugang(datei).hinweis, /beschädigt/);
  fs.writeFileSync(datei, JSON.stringify({ host: 'h' }), { mode: 0o600 });
  assert.match(leseLadenZugang(datei).hinweis, /fehlen Angaben/);
  for (const r of [leseLadenZugang(datei)]) assert.ok(!JSON.stringify(r).includes(GEHEIM));
});

function richteEin(dir) {
  fs.writeFileSync(ladenPostfachPfad(dir), JSON.stringify(ZUGANG), { mode: 0o600 });
}

test('Zwischenspeicher: Passwort steht nie darin, auch nicht bei abgelehnter Anmeldung; alte Eintraege bleiben', async () => {
  const dir = tmp();
  richteEin(dir);
  const ok = await abrufenUndSpeichern(dir, { jetzt: JETZT, verbinden: falscherServer().verbinden });
  assert.equal(ok.fehler, null);
  assert.equal(ok.eintraege.length, 2);
  const schlecht = await abrufenUndSpeichern(dir, { jetzt: new Date(JETZT.getTime() + 600_000), verbinden: falscherServer({ anmeldungOk: false }).verbinden });
  assert.match(schlecht.fehler, /Anmeldung/);
  assert.equal(schlecht.eintraege.length, 2, 'bisherige Mails bleiben stehen');
  const inDatei = fs.readFileSync(ladenMailsPfad(dir), 'utf8');
  assert.ok(!inDatei.includes(GEHEIM));
  assert.ok(!schlecht.fehler.includes(GEHEIM));
  assert.equal(fs.statSync(ladenMailsPfad(dir)).mode & 0o077, 0, 'nur der Benutzer darf den Zwischenspeicher lesen');
});

test('ladenMails: ohne Zugang nicht eingerichtet; mit Zugang genau ein Abruf, frischer Speicher loest keinen aus', async () => {
  const dir = tmp();
  assert.deepEqual(ladenMails(dir, { jetzt: JETZT }), { eingerichtet: false, eintraege: [] });

  richteEin(dir);
  let aufrufe = 0;
  let fertig;
  const abruf = (d, o) => { aufrufe += 1; return new Promise((r) => { fertig = () => r(abrufenUndSpeichern(d, { ...o, verbinden: falscherServer().verbinden })); }); };
  const erst = ladenMails(dir, { jetzt: JETZT, abruf });
  assert.deepEqual([erst.eingerichtet, erst.eintraege.length, erst.stand], [true, 0, null]);
  await new Promise(r => setImmediate(r));
  ladenMails(dir, { jetzt: JETZT, abruf });
  assert.equal(erst.laeuft, true);
  await new Promise(r => setImmediate(r));
  assert.equal(aufrufe, 1, 'kein zweiter Start, solange einer laeuft');
  fertig();
  await new Promise(r => setTimeout(r, 50));
  const danach = ladenMails(dir, { jetzt: new Date(JETZT.getTime() + 1000), abruf });
  assert.equal(danach.eintraege.length, 2);
  assert.equal(danach.fehler, null);
  assert.equal(aufrufe, 1, 'frischer Zwischenspeicher: kein neuer Abruf');
});

test('ladenMails: Zugangsproblem als Hinweis ohne Abruf, ein Fehler im Abruf wirft nie', async () => {
  const dir = tmp();
  fs.writeFileSync(ladenPostfachPfad(dir), JSON.stringify(ZUGANG), { mode: 0o644 });
  fs.chmodSync(ladenPostfachPfad(dir), 0o644);
  let aufrufe = 0;
  const r = ladenMails(dir, { jetzt: JETZT, abruf: async () => { aufrufe += 1; } });
  assert.match(r.fehler, /chmod 600/);
  assert.equal(aufrufe, 0);

  fs.chmodSync(ladenPostfachPfad(dir), 0o600);
  assert.doesNotThrow(() => ladenMails(dir, { jetzt: JETZT, abruf: async () => { throw new Error('boom'); } }));
  await new Promise(r2 => setTimeout(r2, 20));
  fs.writeFileSync(ladenMailsPfad(dir), '{kaputt');
  assert.match(ladenMails(dir, { jetzt: JETZT, abruf: async () => {} }).fehler, /Zwischenspeicher/);
});

test('Angebotsantwort: Annahme ohne Frage wird markiert, nur Angebotsantworten werden gelesen', async () => {
  const s = falscherServer({ uids: [7, 8, 9] });
  const r = await abrufenNurLesend(ZUGANG, { verbinden: s.verbinden, jetzt: JETZT });
  assert.match(s.befehle[4], /^UID FETCH 8,9 \(UID BODY\.PEEK\[\]<0\.65536>\)$/);
  assert.ok(!s.befehle.some(c => /\b(STORE|COPY|EXPUNGE|APPEND|SELECT)\b/.test(c)));
  const von = a => r.eintraege.find(e => e.adresse === a);
  assert.equal(von('kunde-c@example.com').angenommen, true, 'Frage steht nur im Zitat');
  assert.equal(von('kunde-d@example.com').angenommen, undefined, 'Rueckfrage bleibt stehen');
  assert.equal(von('kunde-b@example.com').angenommen, undefined);
});

test('angebotAngenommen: Stichworte im eigenen Teil', () => {
  assert.equal(angebotAngenommen('Vielen Dank für Ihr Angebot. Wir nehmen gern den London-Teppich und haben hierfür auch die Anzahlung getätigt. Leider können wir den Cosmo-Teppich nicht nehmen.'), true);
  assert.equal(angebotAngenommen('wir nehmen das Angebot an und bitten um Lieferung. Bitte teilen Sie uns einen Liefertermin mit.'), true);
  assert.equal(angebotAngenommen('Ist der Teppich fußbodenheizungstauglich?'), false);
  assert.equal(angebotAngenommen('Danke, wir melden uns. Von: Teppich Paradies ... Anzahlung'), false);
});
